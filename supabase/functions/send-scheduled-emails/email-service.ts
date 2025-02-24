import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  content: string;
  metadata: {
    emailId: string;
    campaignId?: string;
    userId: string;
  };
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class EmailService {
  private apiKey: string;
  private supabase: any;

  constructor(apiKey: string) {
    // Validate API key
    if (!apiKey) {
      console.error('SendGrid API key is missing');
      throw new Error('SendGrid API key is required');
    }
    
    if (apiKey.length < 50) {  // SendGrid API keys are typically longer than 50 chars
      console.error('SendGrid API key appears to be invalid (too short)');
      throw new Error('Invalid SendGrid API key format');
    }

    this.apiKey = apiKey;
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase configuration is missing');
      throw new Error('Supabase configuration is required');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);

    // Log configuration status (safely)
    console.log('Email Service Configuration:', {
      has_api_key: !!this.apiKey,
      api_key_length: this.apiKey.length,
      has_supabase_url: !!supabaseUrl,
      has_supabase_key: !!supabaseKey
    });
  }

  private async logEmailAttempt(userId: string, success: boolean, details: Record<string, any>) {
    try {
      await this.supabase
        .from('function_logs')
        .insert([{
          function_name: 'send-scheduled-emails',
          error_message: success ? 'INFO: Email send attempt successful' : 'ERROR: Email send attempt failed',
          error_stack: null,
          context: {
            ...details,
            userId,
            timestamp: new Date().toISOString()
          }
        }]);
    } catch (error) {
      console.error('Error logging email attempt:', error);
    }
  }

  async getSenderEmail(userId: string): Promise<string> {
    try {
      const { data, error } = await this.supabase
        .from('domain_settings')
        .select('sender_email, domain, status, sendgrid_domain_id')
        .eq('user_id', userId)
        .eq('status', 'verified')
        .single();

      if (error) {
        await this.logEmailAttempt(userId, false, {
          error: error.message,
          stage: 'get_sender_email',
          details: error,
          query: {
            user_id: userId,
            status: 'verified'
          }
        });
        throw error;
      }

      if (!data) {
        await this.logEmailAttempt(userId, false, {
          error: 'No verified domain found',
          stage: 'get_sender_email',
          query: {
            user_id: userId,
            status: 'verified'
          }
        });
        throw new Error('No verified domain found');
      }

      // Verify we have a SendGrid domain ID
      if (!data.sendgrid_domain_id) {
        await this.logEmailAttempt(userId, false, {
          error: 'SendGrid domain not properly configured',
          stage: 'get_sender_email',
          domain: data.domain,
          domain_settings: data
        });
        throw new Error('SendGrid domain not properly configured');
      }

      const senderEmail = data.sender_email || `noreply@${data.domain}`;

      await this.logEmailAttempt(userId, true, {
        stage: 'get_sender_email',
        domain: data.domain,
        sender_email: senderEmail,
        sendgrid_domain_id: data.sendgrid_domain_id,
        domain_settings: data
      });
      
      return senderEmail;
    } catch (error) {
      console.error('Error fetching sender email:', error);
      
      await this.logEmailAttempt(userId, false, {
        stage: 'get_sender_email_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        query: {
          user_id: userId,
          status: 'verified'
        }
      });
      
      throw new Error('Failed to get sender email configuration');
    }
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      // Validate API key again before sending
      if (!this.apiKey || this.apiKey.length < 50) {
        throw new Error('Invalid SendGrid API key configuration');
      }

      // Log the API key length (safely)
      await this.logEmailAttempt(options.metadata.userId, true, {
        stage: 'init',
        api_key_length: this.apiKey.length,
        has_api_key: !!this.apiKey,
        email_id: options.metadata.emailId
      });

      // Get sender email from domain settings
      const senderEmail = await this.getSenderEmail(options.metadata.userId);

      // Log the request we're about to make
      await this.logEmailAttempt(options.metadata.userId, true, {
        stage: 'pre_send',
        sender_email: senderEmail,
        to_email: options.to,
        subject: options.subject,
        api_key_configured: !!this.apiKey,
        metadata: options.metadata,
        email_id: options.metadata.emailId
      });

      // Send the email
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{
            to: Array.isArray(options.to) 
              ? options.to.map(email => ({ email }))
              : [{ email: options.to }],
            subject: options.subject
          }],
          from: {
            email: senderEmail,
            name: 'MailVanta'
          },
          subject: options.subject,
          content: [{
            type: 'text/html',
            value: options.content
          }],
          tracking_settings: {
            click_tracking: { enable: true },
            open_tracking: { enable: true }
          },
          custom_args: {
            emailId: options.metadata.emailId,
            campaignId: options.metadata.campaignId
          }
        })
      });

      // Log the response
      await this.logEmailAttempt(options.metadata.userId, response.ok, {
        stage: 'send_response',
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        email_id: options.metadata.emailId
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        throw new Error(
          errorData?.errors?.[0]?.message || 
          `SendGrid API error: ${response.status} ${response.statusText}`
        );
      }

      const messageId = response.headers.get('X-Message-ID');

      // Store the message ID in the email record
      if (messageId) {
        await this.supabase
          .from('emails')
          .update({
            metadata: {
              sg_message_id: messageId,
              ...options.metadata
            }
          })
          .eq('id', options.metadata.emailId);
      }

      return {
        success: true,
        messageId
      };
    } catch (error) {
      console.error('SendGrid send error:', error);
      
      // Log the complete error
      await this.logEmailAttempt(options.metadata.userId, false, {
        stage: 'send_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        email_id: options.metadata.emailId
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export a singleton instance
export const emailService = new EmailService(Deno.env.get('SENDGRID_API_KEY') || ''); 