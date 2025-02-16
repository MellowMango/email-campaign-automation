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

  initialize(type: EmailProviderType, config: { apiKey?: string } = {}): void {
    if (this.provider && this.providerType === type) {
      return; // Already initialized with the same provider
    }

    switch (type) {
      case 'sendgrid':
        if (!config.apiKey) {
          throw new Error('SendGrid API key is required');
        }
        this.provider = new SendGridProvider(config.apiKey);
        break;
      case 'mock':
        this.provider = new MockEmailProvider();
        break;
      default:
        throw new Error(`Unsupported email provider type: ${type}`);
    }

    this.providerType = type;
  }

  getProvider(): EmailProvider {
    if (!this.provider) {
      throw new Error('Email provider not initialized. Call initialize() first.');
    }
    return this.provider;
  }
}

export const emailService = EmailService.getInstance();
export default emailService; 