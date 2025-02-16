import {
  EmailProvider,
  SendEmailOptions,
  SendEmailResult,
  DomainVerificationResult,
  SenderVerificationResult,
  SendingLimits,
  DnsRecord
} from '../types';

export class MockEmailProvider implements EmailProvider {
  private mockDelay = 500; // Simulate network delay
  private mockDailyLimit = 100;
  private sentEmails: { [userId: string]: number } = {};

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    await this.delay();

    // Simulate sending limits
    const limits = await this.checkSendingLimits(options.metadata.userId);
    if (limits.remainingToday <= 0) {
      return {
        success: false,
        error: 'Daily sending limit reached'
      };
    }

    // Track sent email
    this.sentEmails[options.metadata.userId] = (this.sentEmails[options.metadata.userId] || 0) + 1;

    return {
      success: true,
      messageId: `mock_${Date.now()}_${Math.random().toString(36).substring(7)}`
    };
  }

  async verifyDomain(domain: string, userId: string): Promise<DomainVerificationResult> {
    await this.delay();

    const mockDnsRecords: DnsRecord[] = [
      {
        type: 'CNAME',
        host: `em._domainkey.${domain}`,
        data: 'mock.sendgrid.net'
      },
      {
        type: 'TXT',
        host: domain,
        data: 'v=spf1 include:sendgrid.net ~all'
      }
    ];

    return {
      success: true,
      domain,
      dnsRecords: mockDnsRecords
    };
  }

  async verifySender(email: string, userId: string): Promise<SenderVerificationResult> {
    await this.delay();

    return {
      success: true,
      email,
      verified: true
    };
  }

  async checkSendingLimits(userId: string): Promise<SendingLimits> {
    await this.delay();

    const sent = this.sentEmails[userId] || 0;
    return {
      dailyLimit: this.mockDailyLimit,
      remainingToday: this.mockDailyLimit - sent,
      rateLimitDelay: 1000
    };
  }

  private async delay() {
    return new Promise(resolve => setTimeout(resolve, this.mockDelay));
  }
} 