import { Client } from '@sendgrid/client';
import { MailService } from '@sendgrid/mail';
import type { ClientRequest } from '@sendgrid/client/src/request';
import { supabase } from '../../supabase/client';
import {
  EmailProvider,
  SendEmailOptions,
  SendEmailResult,
  DomainVerificationResult,
  SenderVerificationResult,
  SendingLimits,
  DnsRecord
} from '../types';

export class SendGridProvider implements EmailProvider {
  private client: Client;
  private mailService: MailService;
  private readonly DAILY_LIMIT = 100; // Free plan limit
  private readonly RATE_LIMIT_DELAY = 1000; // 1 second between emails
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.client = new Client();
    this.mailService = new MailService();
    
    if (!apiKey) {
      throw new Error('SendGrid API key is required');
    }

    this.apiKey = apiKey;
    this.client.setApiKey(apiKey);
    this.mailService.setApiKey(apiKey);
  }

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      // Check sending limits
      const limits = await this.checkSendingLimits(options.metadata.userId);
      if (limits.remainingToday <= 0) {
        throw new Error('Daily sending limit reached');
      }

      // Verify domain settings
      const { data: domainSettings } = await supabase
        .from('domain_settings')
        .select('*')
        .eq('user_id', options.metadata.userId)
        .eq('status', 'verified')
        .single();

      if (!domainSettings) {
        throw new Error('No verified domain found');
      }

      // Send email
      const [response] = await this.mailService.send({
        to: options.to,
        from: options.from,
        subject: options.subject,
        html: options.content,
        customArgs: options.metadata,
        trackingSettings: {
          clickTracking: { enable: options.trackingSettings?.clickTracking ?? true },
          openTracking: { enable: options.trackingSettings?.openTracking ?? true }
        }
      });

      return {
        success: true,
        messageId: response.headers['x-message-id']
      };
    } catch (error) {
      console.error('SendGrid send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async verifyDomain(domain: string, userId: string): Promise<DomainVerificationResult> {
    try {
      // Check if domain already exists in our database
      const { data: existingDomains } = await supabase
        .from('domain_settings')
        .select('domain')
        .eq('domain', domain);

      if (existingDomains && existingDomains.length > 0) {
        throw new Error('Domain already exists in our records');
      }

      // Create domain authentication in SendGrid
      const response = await fetch('https://api.sendgrid.com/v3/whitelabel/domains', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          domain,
          subdomain: 'em',
          default: false,
          custom_spf: false,
          automatic_security: true
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.message || 'Failed to create domain authentication');
      }

      // Format DNS records
      const dnsRecords: DnsRecord[] = data.dns_records.map((record: any) => ({
        type: record.type,
        host: record.host,
        data: record.data
      }));

      // Store in database
      await supabase
        .from('domain_settings')
        .insert([{
          user_id: userId,
          domain,
          sendgrid_domain_id: data.id,
          status: 'pending',
          dns_records: dnsRecords
        }]);

      return {
        success: true,
        domain,
        dnsRecords
      };
    } catch (error) {
      console.error('SendGrid domain verification error:', error);
      return {
        success: false,
        domain,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async verifySender(email: string, userId: string): Promise<SenderVerificationResult> {
    try {
      // Check if sender already exists
      const response = await fetch('https://api.sendgrid.com/v3/verified_senders', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      const data = await response.json();
      const existingSender = data.results.find((sender: any) => sender.from_email === email);

      if (existingSender?.verified) {
        return {
          success: true,
          email,
          verified: true
        };
      }

      // Create or resend verification
      const verifyResponse = await fetch('https://api.sendgrid.com/v3/verified_senders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nickname: email.split('@')[0],
          from_email: email,
          from_name: email.split('@')[0],
          reply_to: email,
          reply_to_name: email.split('@')[0],
          address: '123 Main St',
          address_2: '',
          city: 'San Francisco',
          state: 'CA',
          zip: '94105',
          country: 'US'
        })
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.errors?.[0]?.message || 'Failed to verify sender');
      }

      // Update database
      await supabase
        .from('domain_settings')
        .update({
          sender_email: email,
          sender_verified: false,
          status: 'sender_pending'
        })
        .eq('user_id', userId);

      return {
        success: true,
        email,
        verified: false
      };
    } catch (error) {
      console.error('SendGrid sender verification error:', error);
      return {
        success: false,
        email,
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async checkSendingLimits(userId: string): Promise<SendingLimits> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('emails')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'sent')
      .gte('sent_at', today.toISOString());

    return {
      dailyLimit: this.DAILY_LIMIT,
      remainingToday: this.DAILY_LIMIT - (count || 0),
      rateLimitDelay: this.RATE_LIMIT_DELAY
    };
  }
} 