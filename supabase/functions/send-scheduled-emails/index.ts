import { createClient } from '@supabase/supabase-js';
import { emailService } from '../../../src/lib/email/service';

// Helper function to update email status
async function updateEmailStatus(
  supabase: any,
  emailId: string,
  status: 'sent' | 'failed',
  error?: string
) {
  const { error: updateError } = await supabase
    .from('emails')
    .update({
      status,
      error_message: error,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', emailId);

  if (updateError) {
    console.error('Error updating email status:', updateError);
  }
}

// Helper function to log errors
async function logError(supabase: any, error: Error, context: Record<string, any>) {
  try {
    await supabase
      .from('function_logs')
      .insert([{
        function_name: 'send-scheduled-emails',
        error_message: error.message,
        error_stack: error.stack,
        context: context
      }]);
  } catch (logError) {
    console.error('Error logging to database:', logError);
  }
}

Deno.serve(async (req) => {
  let supabase;
  
  try {
    const startTime = new Date();
    console.log('Function started at:', startTime.toISOString());

    // Get environment variables
    const sendgridKey = Deno.env.get('SENDGRID_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!sendgridKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }

    // Initialize Supabase
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    // Initialize email service
    emailService.initialize('sendgrid', { apiKey: sendgridKey });
    const provider = emailService.getProvider();

    // Get pending emails using the database function
    const { data: pendingEmails, error: emailsError } = await supabase
      .rpc('get_pending_emails', { batch_size: 10 });

    if (emailsError) {
      console.error('Error fetching pending emails:', emailsError);
      await logError(supabase, emailsError, { stage: 'fetch_emails' });
      return new Response(
        JSON.stringify({ error: 'Error fetching emails', details: emailsError.message }),
        { headers: { 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No emails to send', duration: `${Date.now() - startTime}ms` }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${pendingEmails.length} emails...`);

    // Process each email
    const results = await Promise.all(
      pendingEmails.map(async (email) => {
        try {
          console.log('Sending email:', email.id);

          // Check sending limits
          const limits = await provider.checkSendingLimits(email.user_id);
          if (limits.remainingToday <= 0) {
            throw new Error('Daily sending limit reached');
          }

          // Send email using the provider
          const result = await provider.sendEmail({
            to: email.recipient_email,
            from: {
              email: email.user_email,
              name: email.user_name
            },
            subject: email.subject,
            content: email.content,
            metadata: {
              emailId: email.id,
              campaignId: email.campaign_id,
              userId: email.user_id
            },
            trackingSettings: {
              clickTracking: true,
              openTracking: true
            }
          });

          if (!result.success) {
            throw new Error(result.error || 'Failed to send email');
          }

          // Update status to sent
          await updateEmailStatus(supabase, email.id, 'sent');

          return {
            email_id: email.id,
            campaign_id: email.campaign_id,
            status: 'sent',
            message_id: result.messageId
          };
        } catch (error) {
          console.error('Error sending email:', email.id, error);
          
          // Update status to failed and log error
          await updateEmailStatus(supabase, email.id, 'failed', error.message);
          await logError(supabase, error, { 
            stage: 'send_email', 
            email_id: email.id,
            campaign_id: email.campaign_id
          });

          return {
            email_id: email.id,
            campaign_id: email.campaign_id,
            status: 'failed',
            error: error.message
          };
        }
      })
    );

    const duration = Date.now() - startTime;
    console.log(`Completed processing ${results.length} emails in ${duration}ms`);

    return new Response(
      JSON.stringify({ 
        message: 'Email processing complete',
        results,
        duration: `${duration}ms`
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Function error:', error);
    
    if (supabase) {
      await logError(supabase, error, { stage: 'function_execution' });
    }

    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});