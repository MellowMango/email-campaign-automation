import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { handleRequest } from '../index';

// Import rate limit constants
const RATE_LIMIT = {
  WINDOW_MS: 60000,
  MAX_REQUESTS: 100,
  DAILY_LIMIT: 50000,
  NOTIFICATION_THRESHOLD: 0.8
};

// Mock environment variables
const mockEnv = {
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SENDGRID_API_KEY: 'test-sendgrid-key',
  VITEST: 'true'
};

// Set up environment variables
vi.stubGlobal('Deno', { 
  env: {
    get: (key: string) => mockEnv[key as keyof typeof mockEnv]
  }
});

describe('Webhook Handler', () => {
  let supabase: any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Initialize Supabase client
    supabase = createClient(mockEnv.SUPABASE_URL, mockEnv.SUPABASE_SERVICE_ROLE_KEY);

    // Mock Supabase methods
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'test-email-id',
          user_id: 'test-user-id',
          campaign_id: 'test-campaign-id'
        },
        error: null
      })
    });
  });

  it('should process delivered event successfully', async () => {
    const mockEvent = {
      type: 'delivered',
      email_id: 'test-email-id',
      timestamp: new Date().toISOString()
    };

    const request = new Request('http://localhost:8000/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockEnv.SENDGRID_API_KEY}`
      },
      body: JSON.stringify(mockEvent)
    });

    const response = await handleRequest(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Webhook processed successfully');
  });

  it('should handle error events', async () => {
    const mockEvent = {
      type: 'error',
      email_id: 'test-email-id',
      error: 'Test error',
      timestamp: new Date().toISOString()
    };

    const request = new Request('http://localhost:8000/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockEnv.SENDGRID_API_KEY}`
      },
      body: JSON.stringify(mockEvent)
    });

    const response = await handleRequest(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Webhook processed successfully');
  });

  it('should handle invalid requests', async () => {
    const request = new Request('http://localhost:8000/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const response = await handleRequest(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.message).toBe('Invalid webhook payload');
  });

  // Add more test cases as needed
}); 