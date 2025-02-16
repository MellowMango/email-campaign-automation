import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { emailService } from '../service';
import { SendGridProvider } from '../providers/sendgrid';
import { MockEmailProvider } from '../providers/mock';
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

interface MockQueryResult {
  data: any;
  error: null | Error;
  count?: number;
}

interface MockQuery {
  select: () => MockQuery;
  insert: () => MockQuery;
  update: () => MockQuery;
  delete: () => MockQuery;
  eq: () => MockQuery;
  gte: () => MockQuery;
  single: () => Promise<MockQueryResult>;
  then: (callback: (result: MockQueryResult) => any) => Promise<any>;
}

interface SupabaseMock {
  from: (table: string) => MockQuery;
}

// Create a more robust Supabase mock
const createSupabaseMock = (): SupabaseMock => {
  const mockQuery: MockQuery = {
    select: vi.fn(() => mockQuery),
    insert: vi.fn(() => mockQuery),
    update: vi.fn(() => mockQuery),
    delete: vi.fn(() => mockQuery),
    eq: vi.fn(() => mockQuery),
    gte: vi.fn(() => mockQuery),
    single: vi.fn(() => Promise.resolve({
      data: {
        status: 'verified',
        domain: 'example.com',
        sender_email: 'sender@example.com'
      },
      error: null
    })),
    then: vi.fn((callback) => Promise.resolve(callback({ data: [], count: 0, error: null })))
  };

  return {
    from: vi.fn(() => mockQuery)
  };
};

describe('EmailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('initialization', () => {
    it('should initialize with SendGrid provider', () => {
      emailService.initialize('sendgrid', { apiKey: 'test-key' });
      expect(emailService.getProvider()).toBeInstanceOf(SendGridProvider);
    });

    it('should initialize with Mock provider', () => {
      emailService.initialize('mock');
      expect(emailService.getProvider()).toBeInstanceOf(MockEmailProvider);
    });

    it('should throw error when initializing SendGrid without API key', () => {
      expect(() => emailService.initialize('sendgrid')).toThrow('SendGrid API key is required');
    });

    it('should reuse existing provider if same type', () => {
      emailService.initialize('mock');
      const firstProvider = emailService.getProvider();
      emailService.initialize('mock');
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
        userId: 'user-id'
      }
    };

    beforeEach(() => {
      emailService.initialize('sendgrid', { apiKey: 'test-key' });
    });

    it('should send email successfully', async () => {
      const provider = emailService.getProvider() as SendGridProvider;
      const mailService = (provider as any).mailService;
      mailService.send.mockResolvedValueOnce([
        { statusCode: 202, headers: { 'x-message-id': 'test-message-id' } }
      ]);

      const result = await provider.sendEmail(mockOptions);
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-message-id');
      expect(mailService.send).toHaveBeenCalledWith(expect.objectContaining({
        to: mockOptions.to,
        from: mockOptions.from,
        subject: mockOptions.subject,
        html: mockOptions.content
      }));
    });

    it('should handle send failure', async () => {
      const provider = emailService.getProvider() as SendGridProvider;
      const mailService = (provider as any).mailService;
      mailService.send.mockRejectedValueOnce(new Error('Failed to send'));

      const result = await provider.sendEmail(mockOptions);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to send');
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

  describe('MockEmailProvider', () => {
    beforeEach(() => {
      emailService.initialize('mock');
    });

    it('should simulate email sending', async () => {
      const provider = emailService.getProvider();
      const result = await provider.sendEmail({
        to: 'test@example.com',
        from: { email: 'sender@example.com' },
        subject: 'Test',
        content: 'Test content',
        metadata: { emailId: 'test', userId: 'user-id' }
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^mock_/);
    });

    it('should simulate daily limit exceeded', async () => {
      const provider = emailService.getProvider() as MockEmailProvider;
      
      // Directly set the sent count to simulate reaching the limit
      (provider as any).sentEmails = {
        'user-id': 100
      };

      const result = await provider.sendEmail({
        to: 'test@example.com',
        from: { email: 'sender@example.com' },
        subject: 'Test',
        content: 'Test content',
        metadata: { emailId: 'test-limit', userId: 'user-id' }
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Daily sending limit reached');
    });
  });
}); 