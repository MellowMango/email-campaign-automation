import sgMail from '@sendgrid/mail';
import { createClient } from '@supabase/supabase-js';
import type { Email, Contact } from '../types';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function sendScheduledEmails() {
  try {
    // Get all pending emails that are scheduled for now or in the past
    const { data: emails, error } = await supabase
      .from('emails')
      .select('*, campaigns(company_name, user_id), contacts(*)')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString());

    if (error) throw error;
    if (!emails || emails.length === 0) return;

    console.log(`Found ${emails.length} emails to send`);

    for (const email of emails as Email[]) {
      try {
        // Send email to each contact in the campaign
        const { data: contacts, error: contactsError } = await supabase
          .from('contacts')
          .select('*')
          .eq('campaign_id', email.campaign_id)
          .eq('status', 'active');

        if (contactsError) throw contactsError;
        if (!contacts || contacts.length === 0) continue;

        // Prepare batch of personalized emails
        const messages = (contacts as Contact[]).map(contact => {
          // Replace placeholders in content
          const personalizedContent = email.content
            .replace(/\{first_name\}/g, contact.first_name || '')
            .replace(/\{last_name\}/g, contact.last_name || '')
            .replace(/\{company\}/g, contact.company || '')
            .replace(/\{email\}/g, contact.email);

          return {
            to: contact.email,
            from: {
              email: process.env.SENDGRID_FROM_EMAIL!,
              name: email.campaigns?.company_name || process.env.SENDGRID_FROM_NAME
            },
            subject: email.subject,
            text: personalizedContent,
            html: personalizedContent.replace(/\n/g, '<br>'),
            customArgs: {
              contactId: contact.id,
              emailId: email.id,
              campaignId: email.campaign_id
            },
            trackingSettings: {
              clickTracking: { enable: true },
              openTracking: { enable: true },
              subscriptionTracking: { enable: true }
            }
          };
        });

        // Send emails in batches of 1000 (SendGrid's limit)
        const batchSize = 1000;
        for (let i = 0; i < messages.length; i += batchSize) {
          const batch = messages.slice(i, i + batchSize);
          await sgMail.send(batch);
          
          // Update contacts' status
          const contactIds = batch.map(msg => msg.customArgs.contactId);
          await supabase
            .from('contacts')
            .update({ 
              last_contacted: new Date().toISOString(),
              status: 'contacted'
            })
            .in('id', contactIds);
        }

        // Update email status to sent
        await supabase
          .from('emails')
          .update({ 
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', email.id);

      } catch (emailError) {
        console.error(`Failed to process email ${email.id}:`, emailError);
        // Mark email as failed
        await supabase
          .from('emails')
          .update({ 
            status: 'failed'
          })
          .eq('id', email.id);
      }
    }
  } catch (error) {
    console.error('Error in sendScheduledEmails:', error);
  }
} 