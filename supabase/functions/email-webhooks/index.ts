import { createClient } from '@supabase/supabase-js';
import { serve } from '@std/http/server';
import { crypto } from '@std/crypto/mod';

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
  event: 'processed' | 'dropped' | 'delivered' | 'deferred' | 'bounce' | 'blocked' | 'spam_report' | 'unsubscribe' | 'group_unsubscribe' | 'group_resubscribe' | 'open' | 'click';
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
    // Find the email record
    const { data: emailData, error: emailError } = await supabase
      .from('emails')
      .select('*')
      .eq('metadata->>sg_message_id', sg_message_id)
      .single();

    if (emailError || !emailData) {
      console.error('Email not found:', { sg_message_id, error: emailError });
      return { success: false, error: 'Email not found' };
    }

    // Log the event first
    const { error: eventError } = await supabase
      .from('email_events')
      .insert({
        email_id: emailData.id,
        event_type: eventType,
        timestamp: new Date(timestamp * 1000).toISOString(),
        metadata: event
      });

    if (eventError) {
      console.error('Error logging event:', eventError);
      return { success: false, error: 'Failed to log event' };
    }

    // Handle error events first
    if (['bounce', 'dropped', 'blocked'].includes(eventType)) {
      // Log error
      const { error: errorRecordError } = await supabase
        .from('email_errors')
        .insert({
          email_id: emailData.id,
          error_type: eventType,
          error_message: reason || status || 'Unknown error',
          timestamp: new Date(timestamp * 1000).toISOString(),
          metadata: event
        });

      if (errorRecordError) {
        console.error('Error logging error record:', errorRecordError);
        return { success: false, error: 'Failed to log error record' };
      }

      // Add to retry queue if appropriate
      if ((emailData.retry_count || 0) < 3) {
        const { error: retryError } = await supabase
          .from('retry_queue')
          .insert({
            email_id: emailData.id,
            error_type: eventType,
            retry_count: (emailData.retry_count || 0) + 1,
            next_retry: new Date(Date.now() + 3600000).toISOString(), // Retry in 1 hour
            error_message: reason || status || 'Unknown error'
          });

        if (retryError) {
          console.error('Error adding to retry queue:', retryError);
        }
      }
    }

    // Prepare updates based on event type
    const updates: Record<string, any> = {
      updated_at: new Date(timestamp * 1000).toISOString()
    };

    switch (eventType) {
      case 'delivered':
        updates.status = 'delivered';
        updates.delivered_at = new Date(timestamp * 1000).toISOString();
        break;
      case 'open':
        updates.opened = true;
        updates.opened_at = new Date(timestamp * 1000).toISOString();
        updates.opens_count = (emailData.opens_count || 0) + 1;
        break;
      case 'click':
        updates.clicked = true;
        updates.clicked_at = new Date(timestamp * 1000).toISOString();
        updates.clicks_count = (emailData.clicks_count || 0) + 1;
        break;
      case 'bounce':
      case 'dropped':
      case 'blocked':
        updates.status = 'failed';
        updates.error_message = reason || status;
        updates.error_type = eventType;
        updates.failed_at = new Date(timestamp * 1000).toISOString();
        updates.retry_count = (emailData.retry_count || 0) + 1;
        break;
      case 'spam_report':
      case 'unsubscribe':
      case 'group_unsubscribe':
        updates.status = 'unsubscribed';
        updates.unsubscribed_at = new Date(timestamp * 1000).toISOString();
        updates.unsubscribe_reason = eventType;
        break;
    }

    // Update email status
    const { error: updateError } = await supabase
      .from('emails')
      .update(updates)
      .eq('id', emailData.id);

    if (updateError) {
      console.error('Error updating email:', updateError);
      return { success: false, error: 'Failed to update email status' };
    }

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

// Export the handler function for testing
export async function handleWebhook(req: Request, supabase: SupabaseClient): Promise<Response> {
  try {
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

    // Parse and validate the webhook payload
    const event = await req.json();
    if (!event || !event.type || !event.email_id) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid webhook payload'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Process the event based on its type
    switch (event.type) {
      case 'delivered':
        await supabase
          .from('emails')
          .update({
            status: 'delivered',
            delivered_at: new Date().toISOString()
          })
          .eq('id', event.email_id);
        break;

      case 'error':
        await supabase
          .from('email_retries')
          .insert({
            email_id: event.email_id,
            error: event.error,
            retry_count: 0,
            next_retry: new Date(Date.now() + 300000).toISOString() // Retry in 5 minutes
          });
        break;

      default:
        return new Response(JSON.stringify({
          success: false,
          message: 'Unsupported event type'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Webhook processed successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Main handler function
export const handleRequest = async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    return await handleWebhook(req, supabase);
  } catch (error) {
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
  Deno.serve(handleRequest);
} 