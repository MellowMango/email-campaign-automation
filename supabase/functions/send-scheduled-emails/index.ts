import { createClient } from 'npm:@supabase/supabase-js@2.39.0';
import { Client } from 'npm:@sendgrid/client@8.1.0';
import { MailService } from 'npm:@sendgrid/mail@8.1.0';

async function logError(supabase: any, error: any, metadata: any = {}) {
  try {
    console.error('Logging error to database:', {
      function_name: 'send-scheduled-emails',
      error_message: error instanceof Error ? error.message : String(error),
      error_stack: error instanceof Error ? error.stack : undefined,
      metadata
    });
    
    await supabase
      .from('function_logs')
      .insert([{
        function_name: 'send-scheduled-emails',
        error_message: error instanceof Error ? error.message : String(error),
        error_stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        metadata
      }]);
  } catch (logError) {
    console.error('Failed to log error to database:', logError);
  }
}

async function updateEmailStatus(supabase: any, emailId: string, status: 'sent' | 'failed', errorMessage?: string) {
  const update = {
    status,
    updated_at: new Date().toISOString(),
    ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}),
    ...(errorMessage ? { error_message: errorMessage } : {})
  };

  const { error } = await supabase
    .from('emails')
    .update(update)
    .eq('id', emailId);

  if (error) {
    console.error('Error updating email status:', error);
    await logError(supabase, error, { 
      stage: 'update_status', 
      email_id: emailId, 
      attempted_status: status 
    });
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

    // Initialize SendGrid
    const mailService = new MailService();
    mailService.setApiKey(sendgridKey);

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

          // Prepare email data for SendGrid
          const msg = {
            to: email.recipient_email,
            from: {
              email: email.user_email,
              name: email.user_name
            },
            subject: email.subject,
            html: email.content,
            customArgs: {
              email_id: email.id,
              campaign_id: email.campaign_id
            }
          };

          // Send the email
          await mailService.send(msg);
          
          // Update status to sent
          await updateEmailStatus(supabase, email.id, 'sent');

          return {
            email_id: email.id,
            campaign_id: email.campaign_id,
            status: 'sent'
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
    await logError(supabase, error, { stage: 'main' });

    return new Response(
      JSON.stringify({ 
        error: 'Function execution failed', 
        details: error.message 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
});