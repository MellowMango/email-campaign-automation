import { Client } from '@sendgrid/client';
import { MailService } from '@sendgrid/mail';
import type { ClientRequest } from '@sendgrid/client/src/request';
import { supabase } from '../supabase/client';

// Initialize SendGrid clients
const client = new Client();
const mailService = new MailService();

// Set API key from environment variable
const SENDGRID_API_KEY = import.meta.env.VITE_SENDGRID_API_KEY;
if (!SENDGRID_API_KEY) {
  throw new Error('SendGrid API key is required');
}

client.setApiKey(SENDGRID_API_KEY);
mailService.setApiKey(SENDGRID_API_KEY);

// Configure client for browser environment
const defaultHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SENDGRID_API_KEY}`,
};

export interface DomainAuthenticationResult {
  id: string;
  domain: string;
  subdomain: string;
  dnsRecords: {
    type: string;
    host: string;
    data: string;
  }[];
  valid: boolean;
  validated: boolean;
}

export interface SendEmailOptions {
  to: string;
  from: string;
  subject: string;
  content: string;
  campaignId?: string;
  userId?: string;
}

interface SendGridError {
  message: string;
  field?: string;
  help?: string;
}

interface SendGridErrorResponse {
  errors?: SendGridError[];
}

class SendGridService {
  private client = client;
  private mailService = mailService;

  /**
   * Create domain authentication settings for a user's domain
   */
  async createDomainAuthentication(domain: string, userId: string): Promise<DomainAuthenticationResult> {
    try {
      // First check if domain already exists in our database
      const { data: existingDomains, error: queryError } = await supabase
        .from('domain_settings')
        .select('domain')
        .eq('domain', domain);

      if (queryError) {
        console.error('Error checking existing domain:', queryError);
        throw new Error('Failed to check domain status');
      }

      if (existingDomains && existingDomains.length > 0) {
        throw new Error('Domain already exists in our records');
      }

      // Check if domain exists in SendGrid
      const listResponse = await fetch('https://api.sendgrid.com/v3/whitelabel/domains', {
        method: 'GET',
        headers: defaultHeaders
      });

      const domains = await listResponse.json();
      const existingDomain = domains.find((d: any) => d.domain === domain);

      let responseData;
      if (existingDomain) {
        console.log('Domain already exists in SendGrid, fetching details:', existingDomain);
        responseData = existingDomain;
      } else {
        // Create new domain authentication if it doesn't exist
        const response = await fetch('https://api.sendgrid.com/v3/whitelabel/domains', {
          method: 'POST',
          headers: defaultHeaders,
          body: JSON.stringify({
            domain,
            subdomain: 'em',
            default: false,
            custom_spf: false,
            automatic_security: true,
            ips: []
          })
        });

        responseData = await response.json();
        console.log('SendGrid API Response:', responseData);

        if (!response.ok) {
          const error = responseData.errors?.[0]?.message || 'Failed to create domain authentication';
          console.error('SendGrid API Error:', responseData);
          throw new Error(error);
        }
      }

      // Format DNS records for storage
      let dnsRecords = [];
      if (responseData.dns_records) {
        // New domain format
        dnsRecords = responseData.dns_records.map((record: any) => ({
          type: record.type,
          host: record.host,
          data: record.data
        }));
      } else if (responseData.dns) {
        // Existing domain format
        dnsRecords = Object.entries(responseData.dns).map(([key, value]: [string, any]) => ({
          type: value.type || (key === 'mail_cname' ? 'CNAME' : 'CNAME'),
          host: value.host,
          data: value.data
        }));
      }

      if (dnsRecords.length === 0) {
        throw new Error('No DNS records received from SendGrid');
      }

      // Store domain settings in Supabase
      const { error: insertError } = await supabase
        .from('domain_settings')
        .insert([{
          user_id: userId,
          domain,
          sendgrid_domain_id: responseData.id,
          status: responseData.valid ? 'verified' : 'pending',
          dns_records: dnsRecords
        }]);

      if (insertError) {
        console.error('Supabase Error:', insertError);
        throw new Error('Failed to save domain settings');
      }

      return {
        id: responseData.id,
        domain: responseData.domain,
        subdomain: responseData.subdomain,
        dnsRecords,
        valid: responseData.valid,
        validated: responseData.validated
      };
    } catch (error) {
      console.error('SendGrid domain authentication error:', error);
      throw error;
    }
  }

  /**
   * Verify domain authentication status
   */
  async verifyDomainAuthentication(domainId: string): Promise<boolean> {
    try {
      const response = await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${domainId}/validate`, {
        method: 'POST',
        headers: defaultHeaders
      });

      const data = await response.json();
      return response.ok;
    } catch (error) {
      console.error('SendGrid domain verification error:', error);
      return false;
    }
  }

  /**
   * Send an email using the platform's SendGrid account
   */
  async sendPlatformEmail(options: SendEmailOptions) {
    try {
      await this.mailService.send({
        to: options.to,
        from: 'noreply@mailvanta.com', // Platform's verified sender
        subject: options.subject,
        html: options.content,
        customArgs: {
          platform_email: 'true'
        }
      });
    } catch (error) {
      console.error('SendGrid platform email error:', error);
      throw error;
    }
  }

  /**
   * Send an email using the user's authenticated domain
   */
  async sendUserEmail(options: SendEmailOptions) {
    try {
      // Verify domain authentication before sending
      const { data: domainSettings } = await supabase
        .from('domain_settings')
        .select('*')
        .eq('user_id', options.userId)
        .single();

      if (!domainSettings || domainSettings.status !== 'verified') {
        throw new Error('Domain not verified for sending');
      }

      // Send email through SendGrid
      await this.mailService.send({
        to: options.to,
        from: options.from, // User's verified sender email
        subject: options.subject,
        html: options.content,
        customArgs: {
          campaign_id: options.campaignId,
          user_id: options.userId
        },
        trackingSettings: {
          clickTracking: { enable: true },
          openTracking: { enable: true }
        }
      });
    } catch (error) {
      console.error('SendGrid user email error:', error);
      throw error;
    }
  }

  /**
   * Poll domain verification status
   */
  async pollDomainVerification(domainId: string, userId: string, maxAttempts = 10): Promise<boolean> {
    let attempts = 0;
    
    const poll = async (): Promise<boolean> => {
      if (attempts >= maxAttempts) {
        return false;
      }

      const isValid = await this.verifyDomainAuthentication(domainId);
      
      if (isValid) {
        // Update domain status in Supabase
        await supabase
          .from('domain_settings')
          .update({ status: 'verified' })
          .eq('sendgrid_domain_id', domainId)
          .eq('user_id', userId);
          
        return true;
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds between attempts
      return poll();
    };

    return poll();
  }
}

export const sendgrid = new SendGridService();
export default sendgrid; 