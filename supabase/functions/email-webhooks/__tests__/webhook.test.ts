import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

describe('Email Webhooks Integration Tests', () => {
  let supabase: any;
  const testUserId = 'test-user-id';
  const testEmailId = 'test-email-id';
  const testCampaignId = 'test-campaign-id';

  beforeEach(async () => {
    // Initialize Supabase client with test credentials
    supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Clean up test data
    await cleanupTestData();

    // Insert test data
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  async function setupTestData() {
    // Insert test email
    await supabase
      .from('emails')
      .insert({
        id: testEmailId,
        user_id: testUserId,
        campaign_id: testCampaignId,
        subject: 'Test Email',
        content: 'Test content',
        status: 'sent',
        metadata: {
          messageId: 'test-message-id'
        }
      });
  }

  async function cleanupTestData() {
    await supabase.from('emails').delete().eq('id', testEmailId);
    await supabase.from('email_events').delete().eq('email_id', testEmailId);
    await supabase.from('rate_limits').delete().eq('user_id', testUserId);
    await supabase.from('rate_limit_logs').delete().eq('user_id', testUserId);
  }

  async function generateWebhookSignature(payload: string, timestamp: string): Promise<string> {
    const key = process.env.SENDGRID_WEBHOOK_KEY || 'test-key';
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(timestamp + payload);
    return hmac.digest('hex');
  }

  it('should process delivered event successfully', async () => {
    const event = {
      email: 'recipient@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      'smtp-id': 'test-smtp-id',
      event: 'delivered',
      category: ['test'],
      sg_event_id: 'test-event-id',
      sg_message_id: 'test-message-id'
    };

    const timestamp = new Date().toISOString();
    const payload = JSON.stringify([event]);
    const signature = await generateWebhookSignature(payload, timestamp);

    const response = await fetch('http://localhost:54321/functions/v1/email-webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Twilio-Email-Event-Webhook-Signature': signature,
        'X-Twilio-Email-Event-Webhook-Timestamp': timestamp
      },
      body: payload
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);

    // Verify database updates
    const { data: emailData } = await supabase
      .from('emails')
      .select('*')
      .eq('id', testEmailId)
      .single();

    expect(emailData.status).toBe('delivered');
    expect(emailData.delivered_at).toBeDefined();

    const { data: eventData } = await supabase
      .from('email_events')
      .select('*')
      .eq('email_id', testEmailId)
      .single();

    expect(eventData.event_type).toBe('delivered');
  });

  it('should handle rate limiting', async () => {
    // Set up rate limit exceeded scenario
    await supabase
      .from('rate_limits')
      .insert({
        user_id: testUserId,
        daily_count: 50000,
        window_count: 100,
        last_window: Math.floor(Date.now() / 60000)
      });

    const event = {
      email: 'recipient@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      event: 'delivered',
      sg_message_id: 'test-message-id'
    };

    const timestamp = new Date().toISOString();
    const payload = JSON.stringify([event]);
    const signature = await generateWebhookSignature(payload, timestamp);

    const response = await fetch('http://localhost:54321/functions/v1/email-webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Twilio-Email-Event-Webhook-Signature': signature,
        'X-Twilio-Email-Event-Webhook-Timestamp': timestamp
      },
      body: payload
    });

    expect(response.status).toBe(429);
    
    // Verify rate limit log
    const { data: logData } = await supabase
      .from('rate_limit_logs')
      .select('*')
      .eq('user_id', testUserId)
      .eq('event_type', 'exceeded')
      .single();

    expect(logData).toBeDefined();
  });

  it('should handle invalid signature', async () => {
    const event = {
      email: 'recipient@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      event: 'delivered',
      sg_message_id: 'test-message-id'
    };

    const response = await fetch('http://localhost:54321/functions/v1/email-webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Twilio-Email-Event-Webhook-Signature': 'invalid-signature',
        'X-Twilio-Email-Event-Webhook-Timestamp': new Date().toISOString()
      },
      body: JSON.stringify([event])
    });

    expect(response.status).toBe(401);
  });

  it('should handle error events and create retry entries', async () => {
    const event = {
      email: 'recipient@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      event: 'bounce',
      reason: 'Test bounce reason',
      sg_message_id: 'test-message-id'
    };

    const timestamp = new Date().toISOString();
    const payload = JSON.stringify([event]);
    const signature = await generateWebhookSignature(payload, timestamp);

    const response = await fetch('http://localhost:54321/functions/v1/email-webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Twilio-Email-Event-Webhook-Signature': signature,
        'X-Twilio-Email-Event-Webhook-Timestamp': timestamp
      },
      body: payload
    });

    expect(response.status).toBe(200);

    // Verify error handling
    const { data: errorData } = await supabase
      .from('email_errors')
      .select('*')
      .eq('email_id', testEmailId)
      .single();

    expect(errorData).toBeDefined();
    expect(errorData.error_type).toBe('bounce');

    // Verify retry queue entry
    const { data: retryData } = await supabase
      .from('retry_queue')
      .select('*')
      .eq('email_id', testEmailId)
      .single();

    expect(retryData).toBeDefined();
    expect(retryData.status).toBe('pending');
  });
}); 