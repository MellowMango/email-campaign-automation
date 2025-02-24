import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';

// Rate limiting configuration
const RATE_LIMIT = {
  WINDOW_MS: 60000, // 1 minute
  MAX_REQUESTS: 100, // Max requests per window
  DAILY_LIMIT: 50000, // SendGrid free plan limit
  NOTIFICATION_THRESHOLD: 0.8 // Notify at 80% of limit
};

interface SendGridEvent {
  email: string;
  timestamp: number;
  'smtp-id': string;
  event: 'processed' | 'dropped' | 'delivered' | 'deferred' | 'bounce' | 'blocked' | 'spam_report' | 'unsubscribe' | 'group_unsubscribe' | 'group_resubscribe' | 'open' | 'click' | 'reply';
  category: string[];
  sg_event_id: string;
  sg_message_id: string;
  reason?: string;
  status?: string;
  ip?: string;
  useragent?: string;
  url?: string;
  type?: string;
  marketing_campaign_id?: string;
  marketing_campaign_name?: string;
  attempt?: string;
}

interface RateLimitInfo {
  count: number;
  resetAt: number;
}

interface ErrorContext {
  emailId: string;
  campaignId?: string;
  userId: string;
  eventType?: string;
  eventData?: any;
}

interface RateLimitEvent {
  type: 'success' | 'exceeded';
  count: number;
  windowKey: number;
}

// Helper function to verify SendGrid webhook signature
async function verifySignature(request: Request, body: string): Promise<boolean> {
  const apiKey = Deno.env.get('SENDGRID_API_KEY');
  const authHeader = request.headers.get('Authorization');
  
  // For testing purposes, we'll accept requests with the correct API key
  if (Deno.env.get('NODE_ENV') === 'test') {
    if (authHeader) {
      const providedKey = authHeader.replace('Bearer ', '');
      return providedKey === apiKey;
    }
    return false;
  }

  // In production, we'll do strict API key verification
  if (!authHeader) {
    return false;
  }

  const providedKey = authHeader.replace('Bearer ', '');
  return providedKey === apiKey;
}

// Helper function to check rate limits
async function checkRateLimits(supabase: any, userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const now = Date.now();
  const currentWindow = Math.floor(now / RATE_LIMIT.WINDOW_MS);
  
  try {
    const { data: limits, error: limitsError } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (limitsError) throw limitsError;

    // Initialize or reset window if needed
    if (!limits || limits.last_window !== currentWindow) {
      await supabase.from('rate_limits').upsert({
        user_id: userId,
        window_count: 0,
        daily_count: 0,
        last_window: currentWindow,
        updated_at: new Date().toISOString()
      });
      return { allowed: true };
    }

    // Check window limit
    if (limits.window_count >= RATE_LIMIT.MAX_REQUESTS) {
      return { allowed: false, reason: 'Window limit exceeded' };
    }

    // Check daily limit
    if (limits.daily_count >= RATE_LIMIT.DAILY_LIMIT) {
      return { allowed: false, reason: 'Daily limit exceeded' };
    }

    // Update counters
    await supabase.from('rate_limits').update({
      window_count: limits.window_count + 1,
      daily_count: limits.daily_count + 1,
      updated_at: new Date().toISOString()
    }).eq('user_id', userId);

    // Check if approaching limits
    if (limits.daily_count >= RATE_LIMIT.DAILY_LIMIT * RATE_LIMIT.NOTIFICATION_THRESHOLD) {
      await logRateLimitWarning(supabase, userId, 'approaching_daily_limit');
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking rate limits:', error);
    return { allowed: true }; // Fail open for now
  }
}

// Helper function to process webhook event
async function processWebhookEvent(supabase: any, event: SendGridEvent): Promise<{ success: boolean; error?: string }> {
  const { email, timestamp, event: eventType, sg_message_id, reason, status } = event;

  try {
    console.log('Processing webhook event:', { eventType, sg_message_id });

    // Find the email record with proper SQL syntax
    const { data: emailData, error: emailError } = await supabase
      .from('emails')
      .select('id, campaign_id, metadata')
      .or(`metadata->>sg_message_id.eq.${sg_message_id}, metadata->>messageId.eq.${sg_message_id}`)
      .single();

    if (emailError || !emailData) {
      console.error('Email not found:', { sg_message_id, error: emailError });
      return { success: false, error: 'Email not found' };
    }

    console.log('Found email:', emailData);

    // Log the event first
    const { error: eventError } = await supabase
      .from('email_events')
      .insert({
        email_id: emailData.id,
        campaign_id: emailData.campaign_id,
        event_type: eventType,
        event_data: event,
        occurred_at: new Date(timestamp * 1000).toISOString()
      });

    if (eventError) {
      console.error('Error logging event:', eventError);
      return { success: false, error: 'Failed to log event' };
    }

    console.log('Event logged successfully');

    // Update campaign analytics
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('analytics')
      .eq('id', emailData.campaign_id)
      .single();

    if (campaignError) {
      console.error('Error fetching campaign:', campaignError);
      return { success: false, error: 'Failed to fetch campaign' };
    }

    console.log('Current campaign analytics:', campaign?.analytics);

    const analytics = campaign?.analytics || { sent: 0, opened: 0, clicked: 0, replied: 0 };

    // Update analytics based on event type
    switch (eventType) {
      case 'processed':
      case 'delivered':
        analytics.sent = (analytics.sent || 0) + 1;
        break;
      case 'open':
        analytics.opened = (analytics.opened || 0) + 1;
        break;
      case 'click':
        analytics.clicked = (analytics.clicked || 0) + 1;
        break;
      case 'reply':
        analytics.replied = (analytics.replied || 0) + 1;
        break;
    }

    console.log('Updated analytics:', analytics);

    const { error: updateError } = await supabase
      .from('campaigns')
      .update({ analytics })
      .eq('id', emailData.campaign_id);

    if (updateError) {
      console.error('Error updating campaign analytics:', updateError);
      return { success: false, error: 'Failed to update analytics' };
    }

    console.log('Campaign analytics updated successfully');

    // Update email status and counts
    const updates: Record<string, any> = {
      updated_at: new Date(timestamp * 1000).toISOString()
    };

    const metadata = emailData.metadata || {};

    switch (eventType) {
      case 'delivered':
        updates.status = 'delivered';
        updates.delivered_at = new Date(timestamp * 1000).toISOString();
        break;
      case 'open':
        updates.opened = true;
        updates.opened_at = new Date(timestamp * 1000).toISOString();
        metadata.opens_count = (metadata.opens_count || 0) + 1;
        break;
      case 'click':
        updates.clicked = true;
        updates.clicked_at = new Date(timestamp * 1000).toISOString();
        metadata.clicks_count = (metadata.clicks_count || 0) + 1;
        break;
      case 'bounce':
      case 'dropped':
      case 'blocked':
        updates.status = 'failed';
        updates.error_message = reason || status;
        updates.error_type = eventType;
        updates.failed_at = new Date(timestamp * 1000).toISOString();
        break;
      case 'spam_report':
      case 'unsubscribe':
      case 'group_unsubscribe':
        updates.status = 'unsubscribed';
        updates.unsubscribed_at = new Date(timestamp * 1000).toISOString();
        updates.unsubscribe_reason = eventType;
        break;
    }

    // Update metadata
    updates.metadata = metadata;

    console.log('Updating email with:', updates);

    const { error: emailUpdateError } = await supabase
      .from('emails')
      .update(updates)
      .eq('id', emailData.id);

    if (emailUpdateError) {
      console.error('Error updating email:', emailUpdateError);
      return { success: false, error: 'Failed to update email status' };
    }

    console.log('Email updated successfully');

    return { success: true };
  } catch (error) {
    console.error('Error processing webhook event:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to log rate limit events
async function logRateLimitEvent(supabase: any, userId: string, event: RateLimitEvent): Promise<void> {
  try {
    await supabase
      .from('rate_limit_logs')
      .insert({
        user_id: userId,
        event_type: event.type,
        count: event.count,
        window_key: event.windowKey,
        timestamp: new Date().toISOString()
      });
  } catch (error) {
    console.error('Error logging rate limit event:', error);
  }
}

// Helper function to update email status
async function updateEmailStatus(
  supabase: any,
  messageId: string,
  event: SendGridEvent
): Promise<any> {
  try {
    // Get email record
    const { data: email, error: emailError } = await supabase
      .from('emails')
      .select('id, campaign_id, user_id')
      .eq('metadata->>sg_message_id', messageId)
      .single();

    if (emailError || !email) {
      console.error('Error finding email:', emailError);
      throw new Error(`Email not found for message ID: ${messageId}`);
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    switch (event.event) {
      case 'delivered':
        updates.status = 'delivered';
        updates.delivered_at = new Date(event.timestamp * 1000).toISOString();
        break;
      case 'open':
        updates.opened = true;
        updates.opened_at = new Date(event.timestamp * 1000).toISOString();
        updates.opens_count = updates.opens_count ? updates.opens_count + 1 : 1;
        break;
      case 'click':
        updates.clicked = true;
        updates.clicked_at = new Date(event.timestamp * 1000).toISOString();
        updates.clicks_count = updates.clicks_count ? updates.clicks_count + 1 : 1;
        break;
      case 'bounce':
      case 'dropped':
      case 'blocked':
        updates.status = 'failed';
        updates.error_message = event.reason || event.status;
        updates.error_type = event.event;
        updates.failed_at = new Date(event.timestamp * 1000).toISOString();
        break;
      case 'spam_report':
      case 'unsubscribe':
      case 'group_unsubscribe':
        updates.status = 'unsubscribed';
        updates.unsubscribed_at = new Date(event.timestamp * 1000).toISOString();
        updates.unsubscribe_reason = event.event;
        break;
    }

    // Update email status
    const { error: updateError } = await supabase
      .from('emails')
      .update(updates)
      .eq('id', email.id);

    if (updateError) {
      console.error('Error updating email:', updateError);
      throw updateError;
    }

    // Log the event
    const { error: logError } = await supabase
      .from('email_events')
      .insert({
        email_id: email.id,
        campaign_id: email.campaign_id,
        user_id: email.user_id,
        event_type: event.event,
        event_data: event,
        occurred_at: new Date(event.timestamp * 1000).toISOString()
      });

    if (logError) {
      console.error('Error logging email event:', logError);
      throw logError;
    }

    // Handle error events
    if (['bounce', 'dropped', 'blocked'].includes(event.event)) {
      const { data: errorRecord, error: errorRecordError } = await supabase
        .from('email_errors')
        .insert({
          email_id: email.id,
          error_type: event.event,
          error_message: event.reason || event.status,
          occurred_at: new Date(event.timestamp * 1000).toISOString(),
          metadata: event
        })
        .select()
        .single();

      if (errorRecordError) {
        console.error('Error inserting error record:', errorRecordError);
        throw errorRecordError;
      }

      // Add to retry queue for certain error types
      if (['bounce', 'deferred'].includes(event.event)) {
        const { error: retryError } = await supabase
          .from('retry_queue')
          .insert({
            email_id: email.id,
            error_id: errorRecord.id,
            next_retry_at: new Date(Date.now() + 3600000).toISOString(), // Retry in 1 hour
            status: 'pending',
            metadata: {
              error_event: event.event,
              error_message: event.reason || event.status,
              retry_count: 0,
              max_retries: 3
            }
          });

        if (retryError) {
          console.error('Error inserting into retry queue:', retryError);
          throw retryError;
        }
      }
    }

    return { success: true, emailId: email.id };
  } catch (error) {
    console.error('Error in updateEmailStatus:', error);
    throw error;
  }
}

async function logError(error: Error, context: ErrorContext, supabase: any) {
  try {
    const { data: errorRecord, error: insertError } = await supabase
      .from('email_errors')
      .insert({
        email_id: context.emailId,
        campaign_id: context.campaignId,
        user_id: context.userId,
        error_type: error.name,
        error_message: error.message,
        error_stack: error.stack,
        context: {
          eventType: context.eventType,
          eventData: context.eventData,
          timestamp: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to log error:', insertError);
      return null;
    }

    // Add to retry queue if appropriate
    if (shouldRetry(error)) {
      await addToRetryQueue(errorRecord.id, context, supabase);
    }

    // Send notification
    await sendErrorNotification(errorRecord.id, context, supabase);

    return errorRecord;
  } catch (e) {
    console.error('Error in logError:', e);
    return null;
  }
}

function shouldRetry(error: Error): boolean {
  const retryableErrors = [
    'NetworkError',
    'TimeoutError',
    'ConnectionError',
    'DatabaseError'
  ];
  return retryableErrors.includes(error.name);
}

async function addToRetryQueue(errorId: string, context: ErrorContext, supabase: any) {
  const nextRetryAt = calculateNextRetryTime(0);
  
  try {
    await supabase
      .from('retry_queue')
      .insert({
        email_id: context.emailId,
        error_id: errorId,
        next_retry_at: nextRetryAt,
        metadata: {
          originalEvent: context.eventType,
          originalData: context.eventData
        }
      });
  } catch (e) {
    console.error('Failed to add to retry queue:', e);
  }
}

function calculateNextRetryTime(retryCount: number): Date {
  // Exponential backoff with jitter
  const baseDelay = 5 * 60 * 1000; // 5 minutes
  const maxDelay = 24 * 60 * 60 * 1000; // 24 hours
  const jitter = Math.random() * 30000; // Random jitter up to 30 seconds
  
  const delay = Math.min(
    baseDelay * Math.pow(2, retryCount) + jitter,
    maxDelay
  );
  
  return new Date(Date.now() + delay);
}

async function sendErrorNotification(errorId: string, context: ErrorContext, supabase: any) {
  try {
    await supabase
      .from('error_notifications')
      .insert({
        user_id: context.userId,
        error_id: errorId,
        notification_type: 'error',
        title: 'Email Processing Error',
        message: `An error occurred while processing email ${context.emailId}. Our system will automatically retry if possible.`,
        metadata: {
          emailId: context.emailId,
          campaignId: context.campaignId,
          eventType: context.eventType
        }
      });
  } catch (e) {
    console.error('Failed to send error notification:', e);
  }
}

async function logRateLimitWarning(supabase: any, userId: string, warningType: string): Promise<void> {
  try {
    await supabase
      .from('rate_limit_logs')
      .insert({
        user_id: userId,
        event_type: warningType,
        count: 0,
        window_key: Math.floor(Date.now() / RATE_LIMIT.WINDOW_MS),
        timestamp: new Date().toISOString()
      });
  } catch (error) {
    console.error('Error logging rate limit warning:', error);
  }
}

// Main handler function
export const handleRequest = async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({
        success: false,
        message: 'Method not allowed'
      }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get the raw body for signature verification
    const rawBody = await req.text();
    console.log('Received webhook payload:', rawBody);

    // Verify webhook signature
    const isValid = await verifySignature(req, rawBody);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid signature'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse events - SendGrid can send single event or array of events
    let events: SendGridEvent[];
    try {
      const parsed = JSON.parse(rawBody);
      events = Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      console.error('Error parsing webhook payload:', error);
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid JSON payload'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Processing events:', events);

    // Process each event
    const results = await Promise.all(
      events.map(event => processWebhookEvent(supabase, event))
    );

    // Check if any events failed
    const hasErrors = results.some(result => !result.success);
    if (hasErrors) {
      const errors = results
        .filter(result => !result.success)
        .map(result => result.error);
      
      console.error('Some events failed processing:', errors);
      
      return new Response(JSON.stringify({
        success: false,
        message: 'Some events failed to process',
        errors
      }), {
        status: 207,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'All events processed successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Start server if not in test environment
if (!Deno.env.get('VITEST')) {
  serve(handleRequest);
} 