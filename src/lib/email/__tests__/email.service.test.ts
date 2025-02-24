import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { emailService } from '../service';
import { SendGridProvider } from '../providers/sendgrid';
import type { SendEmailOptions } from '../types';

// Mock @sendgrid/mail and @sendgrid/client
vi.mock('@sendgrid/mail', () => ({
  MailService: vi.fn().mockImplementation(() => ({
    setApiKey: vi.fn(),
    send: vi.fn()
  }))
}));

vi.mock('@sendgrid/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    setApiKey: vi.fn(),
    request: vi.fn()
  }))
}));

// Mock environment variables
vi.mock('import.meta', () => ({
  env: {
    VITE_SENDGRID_API_KEY: undefined
  }
}));

// Mock supabase client
vi.mock('../../supabase/client', () => {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: {
        status: 'verified',
        domain: 'example.com',
        sender_email: 'sender@example.com'
      },
      error: null
    }),
    then: vi.fn().mockImplementation((callback) => 
      Promise.resolve(callback({ data: [], count: 0, error: null }))
    )
  };

  return {
    supabase: {
      from: vi.fn().mockReturnValue(mockQuery)
    }
  };
});

describe('EmailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the provider before each test
    (emailService as any).provider = null;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('initialization', () => {
    it('should initialize with SendGrid provider when API key is provided', () => {
      emailService.initialize('test-key');
      expect(emailService.getProvider()).toBeInstanceOf(SendGridProvider);
    });

    it('should throw error when no API key is available', () => {
      expect(() => emailService.getProvider()).toThrow('Email provider not initialized and no API key available');
    });

    it('should initialize with environment variable if available', () => {
      // Mock the environment variable
      (import.meta.env as any).VITE_SENDGRID_API_KEY = 'env-test-key';
      expect(emailService.getProvider()).toBeInstanceOf(SendGridProvider);
      // Clean up
      (import.meta.env as any).VITE_SENDGRID_API_KEY = undefined;
    });

    it('should reuse existing provider', () => {
      emailService.initialize('test-key');
      const firstProvider = emailService.getProvider();
      emailService.initialize('different-key');
      const secondProvider = emailService.getProvider();
      expect(firstProvider).toBe(secondProvider);
    });
  });

  describe('SendGridProvider', () => {
    const mockOptions: SendEmailOptions = {
      to: 'test@example.com',
      from: {
        email: 'sender@example.com',
        name: 'Test Sender'
      },
      subject: 'Test Email',
      content: '<p>Test content</p>',
      metadata: {
        emailId: 'test-id',
        userId: 'user-id',
        campaignId: 'campaign-id'
      }
    };

    beforeEach(() => {
      emailService.initialize('test-key');
    });

    it('should send email successfully', async () => {
      const provider = emailService.getProvider() as SendGridProvider;
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 202,
        statusText: 'Accepted',
        headers: new Headers({
          'x-message-id': 'test-message-id'
        }),
        json: () => Promise.resolve({})
      });

      const result = await provider.sendEmail(mockOptions);
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should handle send failure', async () => {
      const provider = emailService.getProvider() as SendGridProvider;
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({
          errors: [{ message: 'Invalid recipient email' }]
        })
      });

      const result = await provider.sendEmail(mockOptions);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid recipient email');
    });

    it('should verify domain', async () => {
      const provider = emailService.getProvider() as SendGridProvider;
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'domain-id',
          dns_records: [
            { type: 'CNAME', host: 'em.example.com', data: 'u123.wl.sendgrid.net' }
          ]
        })
      });

      const result = await provider.verifyDomain('example.com', 'user-id');
      expect(result.success).toBe(true);
      expect(result.dnsRecords).toBeDefined();
      expect(result.dnsRecords?.length).toBe(1);
    });

    it('should verify sender email', async () => {
      const provider = emailService.getProvider() as SendGridProvider;
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ results: [] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'sender-id' })
        });

      const result = await provider.verifySender('sender@example.com', 'user-id');
      expect(result.success).toBe(true);
      expect(result.email).toBe('sender@example.com');
    });

    it('should check sending limits', async () => {
      const provider = emailService.getProvider() as SendGridProvider;
      const result = await provider.checkSendingLimits('user-id');
      expect(result.dailyLimit).toBe(100);
      expect(result.remainingToday).toBe(100);
      expect(result.rateLimitDelay).toBe(1000);
    });
  });
}); 