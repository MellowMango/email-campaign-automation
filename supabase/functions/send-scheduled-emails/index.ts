import { createClient } from '@supabase/supabase-js';
import { Client } from '@sendgrid/client';
import { MailService } from '@sendgrid/mail';

// Initialize SendGrid clients
const client = new Client();
const mailService = new MailService();

// Set API key from environment variable
client.setApiKey(Deno.env.get('SENDGRID_API_KEY') || '');
mailService.setApiKey(Deno.env.get('SENDGRID_API_KEY') || '');

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  try {
    // Get all pending emails that are scheduled to be sent
    const now = new Date();
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select(`
        *,
        campaigns (
          user_id,
          name,
          company_name
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', now.toISOString())
      .order('scheduled_at');

    if (emailsError) throw emailsError;
    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ message: 'No emails to send' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Process each email
    const results = await Promise.all(
      emails.map(async (email) => {
        try {
          // Get contacts for this campaign
          const { data: contacts, error: contactsError } = await supabase
            .from('contacts')
            .select('*')
            .eq('campaign_id', email.campaign_id);

          if (contactsError) throw contactsError;
          if (!contacts || contacts.length === 0) {
            throw new Error('No contacts found for campaign');
          }

          // Get domain settings for the user
          const { data: domainSettings, error: domainError } = await supabase
            .from('domain_settings')
            .select('*')
            .eq('user_id', email.campaigns.user_id)
            .eq('status', 'verified')
            .single();

          if (domainError || !domainSettings) {
            throw new Error('No verified domain found for user');
          }

          // Send email to each contact
          await Promise.all(
            contacts.map(async (contact) => {
              // Replace placeholders in content
              const personalizedContent = email.content
                .replace(/{{recipient_name}}/g, `${contact.first_name} ${contact.last_name}`)
                .replace(/{{sender_name}}/g, email.campaigns.name)
                .replace(/{{company_name}}/g, email.campaigns.company_name || '');

              // Send email through SendGrid
              await mailService.send({
                to: contact.email,
                from: `noreply@${domainSettings.domain}`,
                subject: email.subject,
                html: personalizedContent,
                customArgs: {
                  campaign_id: email.campaign_id,
                  email_id: email.id,
                  contact_id: contact.id
                },
                trackingSettings: {
                  clickTracking: { enable: true },
                  openTracking: { enable: true }
                }
              });
            })
          );

          // Update email status to sent
          const { error: updateError } = await supabase
            .from('emails')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString()
            })
            .eq('id', email.id);

          if (updateError) throw updateError;

          return {
            emailId: email.id,
            status: 'success',
            message: `Email sent to ${contacts.length} contacts`
          };
        } catch (error) {
          // Update email status to failed
          await supabase
            .from('emails')
            .update({
              status: 'failed'
            })
            .eq('id', email.id);

          return {
            emailId: email.id,
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to send email'
          };
        }
      })
    );

    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}); 