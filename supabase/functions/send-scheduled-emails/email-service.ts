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

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('SendGrid API key is required');
    }
    this.apiKey = apiKey;
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{
            to: Array.isArray(options.to) 
              ? options.to.map(email => ({ email }))
              : [{ email: options.to }]
          }],
          from: { email: 'noreply@mailvanta.com' },
          subject: options.subject,
          content: [{ type: 'text/html', value: options.content }],
          custom_args: options.metadata,
          tracking_settings: {
            click_tracking: { enable: true },
            open_tracking: { enable: true }
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.errors?.[0]?.message || 'Failed to send email');
      }

      return {
        success: true,
        messageId: response.headers.get('X-Message-ID')
      };
    } catch (error) {
      console.error('SendGrid send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export a singleton instance
export const emailService = new EmailService(Deno.env.get('SENDGRID_API_KEY') || ''); 