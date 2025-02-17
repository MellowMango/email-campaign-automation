import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { handleRequest } from '../index';

// Mock EmailService
vi.mock('../email-service', () => ({
  emailService: {
    send: vi.fn().mockResolvedValue({ success: true })
  }
}));

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

// Mock process.env
vi.stubGlobal('process', {
  env: mockEnv
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}));

describe('Scheduler', () => {
  let supabase: any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock Supabase instance with proper method chaining
    const mockEmails = [
      {
        id: 'test-email-1',
        to: 'test1@example.com',
        subject: 'Test Email 1',
        content: 'Test content 1',
        status: 'scheduled',
        scheduled_for: new Date().toISOString(),
        metadata: {
          emailId: 'test-email-1',
          userId: 'test-user-1'
        }
      }
    ];

    // Mock Supabase client with proper method chaining
    supabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({
              data: mockEmails,
              error: null
            })
          })
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 'test-email-1', status: 'sent' }],
            error: null
          })
        })
      }))
    };

    // Set up createClient mock
    (createClient as any).mockReturnValue(supabase);
  });

  it('should send due emails successfully', async () => {
    const request = new Request('http://localhost:8000/scheduler', {
      method: 'POST'
    });

    const response = await handleRequest(request);
    const data = await response.json();
    console.log('Response data:', data);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Scheduled emails processed successfully');
    expect(data.sent).toBe(1);
  });

  it('should handle no due emails', async () => {
    // Override the mock for this test to return empty data
    supabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      })
    }));

    const request = new Request('http://localhost:8000/scheduler', {
      method: 'POST'
    });

    const response = await handleRequest(request);
    const data = await response.json();
    console.log('Response data:', data);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('No emails due for sending');
    expect(data.sent).toBe(0);
  });

  it('should handle email sending failures', async () => {
    // Mock email sending failure
    const { emailService } = await import('../email-service');
    (emailService.send as any).mockRejectedValueOnce(new Error('Failed to send'));

    const request = new Request('http://localhost:8000/scheduler', {
      method: 'POST'
    });

    const response = await handleRequest(request);
    const data = await response.json();
    console.log('Response data:', data);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('Scheduled emails processed successfully');
    expect(data.sent).toBe(0);
  });
}); 