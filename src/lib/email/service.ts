import { EmailProvider } from './types';
import { SendGridProvider } from './providers/sendgrid';
import { MockEmailProvider } from './providers/mock';

export type EmailProviderType = 'sendgrid' | 'mock';

class EmailService {
  private static instance: EmailService;
  private provider: EmailProvider | null = null;
  private providerType: EmailProviderType | null = null;

  private constructor() {}

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  initialize(apiKey: string): void {
    if (!this.provider) {
      this.provider = new SendGridProvider(apiKey);
    }
  }

  getProvider(): EmailProvider {
    if (!this.provider) {
      // Try to initialize with environment variable
      const apiKey = import.meta.env.VITE_SENDGRID_API_KEY;
      if (!apiKey) {
        throw new Error('Email provider not initialized and no API key available');
      }
      this.initialize(apiKey);
    }

    if (!this.provider) {
      throw new Error('Failed to initialize email provider');
    }

    return this.provider;
  }
}

export const emailService = EmailService.getInstance();
export default emailService; 