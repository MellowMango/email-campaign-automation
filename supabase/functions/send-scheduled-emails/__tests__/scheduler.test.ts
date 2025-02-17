import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { emailService } from '../../../../src/lib/email/service';

describe('Send Scheduled Emails Integration Tests', () => {
  let supabase: any;
  const testUserId = 'test-user-id';
  const testCampaignId = 'test-campaign-id';

  beforeEach(async () => {
    // Initialize Supabase client with test credentials
    supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Initialize email service with mock provider
    emailService.initialize('mock');

    // Clean up test data
    await cleanupTestData();

    // Insert test data
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  async function setupTestData() {
    // Insert test campaign
    await supabase
      .from('campaigns')
      .insert({
        id: testCampaignId,
        user_id: testUserId,
        name: 'Test Campaign',
        status: 'active'
      });

    // Insert test emails
    const now = new Date();
    const emails = [
      {
        user_id: testUserId,
        campaign_id: testCampaignId,
        subject: 'Test Email 1',
        content: 'Content 1',
        status: 'pending',
        scheduled_at: new Date(now.getTime() - 1000).toISOString() // 1 second ago
      },
      {
        user_id: testUserId,
        campaign_id: testCampaignId,
        subject: 'Test Email 2',
        content: 'Content 2',
        status: 'pending',
        scheduled_at: new Date(now.getTime() + 3600000).toISOString() // 1 hour from now
      }
    ];

    await supabase.from('emails').insert(emails);
  }

  async function cleanupTestData() {
    await supabase.from('emails').delete().eq('campaign_id', testCampaignId);
    await supabase.from('campaigns').delete().eq('id', testCampaignId);
    await supabase.from('function_logs').delete().eq('function_name', 'send-scheduled-emails');
  }

  it('should send due emails successfully', async () => {
    const response = await fetch('http://localhost:54321/functions/v1/send-scheduled-emails', {
      method: 'POST'
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.results).toBeDefined();
    expect(result.results.length).toBe(1); // Only one email was due

    // Verify email status updates
    const { data: emailData } = await supabase
      .from('emails')
      .select('*')
      .eq('campaign_id', testCampaignId)
      .order('scheduled_at');

    expect(emailData[0].status).toBe('sent');
    expect(emailData[0].sent_at).toBeDefined();
    expect(emailData[1].status).toBe('pending'); // Future email should still be pending
  });

  it('should handle sending failures gracefully', async () => {
    // Mock a sending limit exceeded scenario
    const mockProvider = emailService.getProvider();
    const sendSpy = vi.spyOn(mockProvider, 'sendEmail');
    sendSpy.mockResolvedValueOnce({ success: false, error: 'Daily sending limit reached' });

    const response = await fetch('http://localhost:54321/functions/v1/send-scheduled-emails', {
      method: 'POST'
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.results.some((r: any) => r.status === 'failed')).toBe(true);

    // Verify error logging
    const { data: logData } = await supabase
      .from('function_logs')
      .select('*')
      .eq('function_name', 'send-scheduled-emails')
      .single();

    expect(logData).toBeDefined();
    expect(logData.error_message).toContain('Daily sending limit reached');
  });

  it('should respect rate limits', async () => {
    // Insert many test emails
    const now = new Date();
    const emails = Array.from({ length: 15 }, (_, i) => ({
      user_id: testUserId,
      campaign_id: testCampaignId,
      subject: `Test Email ${i}`,
      content: `Content ${i}`,
      status: 'pending',
      scheduled_at: new Date(now.getTime() - 1000).toISOString()
    }));

    await supabase.from('emails').insert(emails);

    const response = await fetch('http://localhost:54321/functions/v1/send-scheduled-emails', {
      method: 'POST'
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    
    // Should only process batch_size number of emails
    expect(result.results.length).toBe(10); // Default batch size

    // Verify remaining emails are still pending
    const { data: pendingEmails } = await supabase
      .from('emails')
      .select('*')
      .eq('status', 'pending');

    expect(pendingEmails.length).toBe(5);
  });

  it('should verify cron job is scheduled and active', async () => {
    // Check if the cron job exists and is active
    const { data: cronJob } = await supabase
      .rpc('check_cron_job', { job_name: 'send-scheduled-emails' });

    expect(cronJob).toBeDefined();
    expect(cronJob.exists).toBe(true);
    expect(cronJob.is_active).toBe(true);
    expect(cronJob.schedule).toBe('* * * * *');
  });

  it('should handle missing environment variables', async () => {
    // Temporarily unset required env vars
    const originalUrl = Deno.env.get('SUPABASE_URL');
    const originalKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    Deno.env.delete('SUPABASE_URL');
    Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');

    const response = await fetch('http://localhost:54321/functions/v1/send-scheduled-emails', {
      method: 'POST'
    });

    expect(response.status).toBe(500);
    const result = await response.json();
    expect(result.error).toBe('Missing required environment variables');

    // Restore env vars
    if (originalUrl) Deno.env.set('SUPABASE_URL', originalUrl);
    if (originalKey) Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', originalKey);
  });
}); 