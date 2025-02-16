import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';

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

// Helper function to verify SendGrid webhook signature
async function verifySignature(request: Request, body: string): Promise<boolean> {
  const signature = request.headers.get('X-Twilio-Email-Event-Webhook-Signature');
  const timestamp = request.headers.get('X-Twilio-Email-Event-Webhook-Timestamp');
  const key = Deno.env.get('SENDGRID_WEBHOOK_KEY');

  if (!signature || !timestamp || !key) {
    return false;
  }

  const encoder = new TextEncoder();
  const payload = timestamp + body;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  return await crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    new Uint8Array(signature.match(/.{2}/g)!.map(byte => parseInt(byte, 16))),
    encoder.encode(payload)
  );
}

// Helper function to check and update rate limits
async function checkRateLimit(supabase: any, userId: string): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  const windowKey = Math.floor(now / RATE_LIMIT.WINDOW_MS);
  const dailyKey = Math.floor(now / (24 * 60 * 60 * 1000));
  
  try {
    // Get current rate limit info from KV store
    const { data: rateLimitData } = await supabase
      .from('rate_limits')
      .select('window_count, daily_count, last_window')
      .eq('user_id', userId)
      .single();

    let windowCount = 0;
    let dailyCount = 0;

    if (rateLimitData) {
      // Reset window count if we're in a new window
      if (rateLimitData.last_window !== windowKey) {
        windowCount = 1;
      } else {
        windowCount = rateLimitData.window_count + 1;
      }

      // Reset daily count if we're in a new day
      if (Math.floor(rateLimitData.last_window / (24 * 60)) !== dailyKey) {
        dailyCount = 1;
      } else {
        dailyCount = rateLimitData.daily_count + 1;
      }
    } else {
      windowCount = 1;
      dailyCount = 1;
    }

    // Update rate limit info
    await supabase
      .from('rate_limits')
      .upsert({
        user_id: userId,
        window_count: windowCount,
        daily_count: dailyCount,
        last_window: windowKey,
        updated_at: new Date().toISOString()
      });

    // Check if we should send a notification about approaching limits
    if (dailyCount >= RATE_LIMIT.DAILY_LIMIT * RATE_LIMIT.NOTIFICATION_THRESHOLD) {
      await notifyDailyLimitApproaching(supabase, userId, dailyCount);
    }

    return {
      allowed: windowCount <= RATE_LIMIT.MAX_REQUESTS && dailyCount <= RATE_LIMIT.DAILY_LIMIT,
      remaining: Math.min(
        RATE_LIMIT.MAX_REQUESTS - windowCount,
        RATE_LIMIT.DAILY_LIMIT - dailyCount
      )
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Fail open - allow the request but log the error
    return { allowed: true, remaining: 0 };
  }
}

// Helper function to send notifications about approaching limits
async function notifyDailyLimitApproaching(supabase: any, userId: string, currentCount: number): Promise<void> {
  try {
    const percentageUsed = (currentCount / RATE_LIMIT.DAILY_LIMIT) * 100;
    
    // Check if we've already notified for this threshold today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: existingNotification } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'rate_limit_warning')
      .gte('created_at', today.toISOString())
      .single();

    if (!existingNotification) {
      await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          title: 'Daily Email Limit Warning',
          message: `You have used ${percentageUsed.toFixed(1)}% of your daily email limit (${currentCount}/${RATE_LIMIT.DAILY_LIMIT})`,
          type: 'rate_limit_warning',
          status: 'unread',
          metadata: {
            current_count: currentCount,
            daily_limit: RATE_LIMIT.DAILY_LIMIT,
            percentage_used: percentageUsed
          }
        });
    }
  } catch (error) {
    console.error('Notification error:', error);
  }
}

// Helper function to log rate limit events
async function logRateLimitEvent(supabase: any, userId: string, event: any): Promise<void> {
  try {
    await supabase
      .from('rate_limit_logs')
      .insert({
        user_id: userId,
        event_type: event.type,
        request_count: event.count,
        window_key: event.windowKey,
        metadata: event
      });
  } catch (error) {
    console.error('Rate limit log error:', error);
  }
}

// Helper function to update email status
async function updateEmailStatus(
  supabase: any,
  messageId: string,
  event: SendGridEvent
): Promise<void> {
  const { data: email } = await supabase
    .from('emails')
    .select('id, campaign_id, user_id')
    .eq('metadata->messageId', messageId)
    .single();

  if (!email) {
    console.error('Email not found for message ID:', messageId);
    return;
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
      break;
    case 'spam_report':
    case 'unsubscribe':
    case 'group_unsubscribe':
      updates.status = 'unsubscribed';
      updates.unsubscribed_at = new Date(event.timestamp * 1000).toISOString();
      break;
  }

  // Update email record
  const { error: emailError } = await supabase
    .from('emails')
    .update(updates)
    .eq('id', email.id);

  if (emailError) {
    console.error('Error updating email:', emailError);
    return;
  }

  // Log the event
  const { error: logError } = await supabase
    .from('email_events')
    .insert([{
      email_id: email.id,
      campaign_id: email.campaign_id,
      user_id: email.user_id,
      event_type: event.event,
      event_data: event,
      occurred_at: new Date(event.timestamp * 1000).toISOString()
    }]);

  if (logError) {
    console.error('Error logging email event:', logError);
  }

  // Update campaign analytics if needed
  if (['open', 'click', 'unsubscribe'].includes(event.event)) {
    const { error: campaignError } = await supabase.rpc('update_campaign_analytics', {
      p_campaign_id: email.campaign_id,
      p_event_type: event.event
    });

    if (campaignError) {
      console.error('Error updating campaign analytics:', campaignError);
    }
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

serve(async (req) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Get the raw body
    const body = await req.text();

    // Verify webhook signature
    const isValid = await verifySignature(req, body);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return new Response('Unauthorized', { status: 401 });
    }

    // Parse events
    const events: SendGridEvent[] = JSON.parse(body);
    if (!Array.isArray(events)) {
      throw new Error('Invalid event format');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    // Get user ID from the first event
    const { data: email } = await supabase
      .from('emails')
      .select('user_id')
      .eq('metadata->messageId', events[0].sg_message_id)
      .single();

    if (!email?.user_id) {
      throw new Error('User not found for event');
    }

    // Check rate limits
    const rateLimit = await checkRateLimit(supabase, email.user_id);
    if (!rateLimit.allowed) {
      await logRateLimitEvent(supabase, email.user_id, {
        type: 'exceeded',
        count: events.length,
        windowKey: Math.floor(Date.now() / RATE_LIMIT.WINDOW_MS)
      });
      return new Response('Rate limit exceeded', { status: 429 });
    }

    // Process each event
    const results = [];
    for (const event of events) {
      try {
        const { data: email, error: emailError } = await supabase
          .from('emails')
          .select('id, user_id, campaign_id')
          .eq('message_id', event.sg_message_id)
          .single();

        if (emailError) {
          throw new Error(`Failed to find email: ${emailError.message}`);
        }

        const context: ErrorContext = {
          emailId: email.id,
          userId: email.user_id,
          campaignId: email.campaign_id,
          eventType: event.event,
          eventData: event
        };

        // Check rate limits
        const rateLimitResult = await checkRateLimit(supabase, email.user_id);
        if (!rateLimitResult.allowed) {
          throw new Error(`Rate limit exceeded: ${rateLimitResult.reason}`);
        }

        // Process the event
        const result = await updateEmailStatus(supabase, event.sg_message_id, event);
        results.push(result);

      } catch (error) {
        const errorRecord = await logError(error as Error, {
          emailId: 'unknown',
          userId: 'system',
          eventType: 'webhook_processing'
        }, supabase);
        results.push({ error: true, errorId: errorRecord?.id });
      }
    }

    // Log successful rate limit usage
    await logRateLimitEvent(supabase, email.user_id, {
      type: 'success',
      count: events.length,
      windowKey: Math.floor(Date.now() / RATE_LIMIT.WINDOW_MS),
      remaining: rateLimit.remaining
    });

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    const errorRecord = await logError(error as Error, {
      emailId: 'unknown',
      userId: 'system',
      eventType: 'webhook_processing'
    }, supabase);

    return new Response(
      JSON.stringify({
        error: true,
        message: 'Internal server error',
        errorId: errorRecord?.id
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}); 