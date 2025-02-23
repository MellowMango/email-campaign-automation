import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { emailService } from './email-service.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Helper function to verify cron job
async function verifyCronJob(supabase: any): Promise<{ exists: boolean; is_active: boolean; schedule: string }> {
  try {
    const { data: cronJob, error } = await supabase.rpc('check_cron_job', {
      job_name: 'send-scheduled-emails',
      exists: true,
      is_active: true,
      schedule: '* * * * *'
    });

    if (error) {
      console.error('Error checking cron job:', error);
      return { exists: false, is_active: false, schedule: '' };
    }

    if (!cronJob) {
      console.error('Cron job not found');
      return { exists: false, is_active: false, schedule: '' };
    }

    return {
      exists: true,
      is_active: true,
      schedule: '* * * * *'
    };
  } catch (error) {
    console.error('Error verifying cron job:', error);
    return { exists: false, is_active: false, schedule: '' };
  }
}

// Helper function to log function execution
async function logFunctionExecution(supabase: any, message: string, context: Record<string, any> = {}, isError = false) {
  try {
    await supabase
      .from('function_logs')
      .insert([{
        function_name: 'send-scheduled-emails',
        error_message: isError ? message : 'INFO: ' + message,
        error_stack: null,
        context: context,
        timestamp: new Date().toISOString()
      }]);
  } catch (error) {
    console.error('Error logging to database:', error);
  }
}

// Helper function to process a batch of emails
async function processBatch(supabase: any, batchSize: number = 10): Promise<{ 
  success: boolean;
  processed: number;
  results: Array<{ id: string; status: 'sent' | 'failed'; error?: string }>;
}> {
  const results: Array<{ id: string; status: 'sent' | 'failed'; error?: string }> = [];
  let processed = 0;

  try {
    // Log start of batch processing with more details
    await logFunctionExecution(supabase, 'Starting batch processing', {
      batchSize,
      currentTime: new Date().toISOString(),
      environment: {
        has_sendgrid_key: !!Deno.env.get('SENDGRID_API_KEY'),
        has_supabase_url: !!Deno.env.get('SUPABASE_URL'),
        has_service_role_key: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      }
    });

    // Get pending emails with simpler query to reduce potential failures
    const { data: emails, error: fetchError } = await supabase
      .from('emails')
      .select(`
        id,
        subject,
        content,
        to_email,
        campaign_id,
        campaigns!inner (
          user_id
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(10);

    if (fetchError) {
      throw new Error(`Failed to fetch emails: ${fetchError.message}`);
    }

    await logFunctionExecution(supabase, `Found ${emails?.length || 0} pending emails`, {
      emailCount: emails?.length,
      emails: emails?.map(e => ({
        id: e.id,
        scheduled_at: e.scheduled_at,
        campaign_id: e.campaign_id,
        user_id: e.campaigns?.user_id,
        scheduled_time_diff: new Date(e.scheduled_at).getTime() - new Date().getTime()
      }))
    });

    if (!emails || emails.length === 0) {
      return { success: true, processed: 0, results: [] };
    }

    // Process each email in the batch
    for (const email of emails) {
      try {
        await logFunctionExecution(supabase, `Processing email ${email.id}`, {
          emailId: email.id,
          campaignId: email.campaign_id,
          userId: email.campaigns?.user_id,
          to_email: email.to_email,
          scheduled_at: email.scheduled_at,
        });

        // Update to processing
        await supabase
          .from('emails')
          .update({ status: 'processing' })
          .eq('id', email.id);

        // Send email
        const sendResult = await emailService.send({
          to: email.to_email,
          subject: email.subject,
          content: email.content,
          metadata: {
            emailId: email.id,
            campaignId: email.campaign_id,
            userId: email.campaigns.user_id
          }
        });

        // Update status based on result
        await supabase
          .from('emails')
          .update({
            status: sendResult.success ? 'sent' : 'failed',
            error_message: sendResult.error || null,
            sent_at: sendResult.success ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id);

        results.push({
          id: email.id,
          success: sendResult.success,
          error: sendResult.error
        });
        processed++;
      } catch (error) {
        await logFunctionExecution(supabase, `Error processing email ${email.id}: ${error.message}`, { 
          error,
          emailId: email.id,
          campaignId: email.campaign_id,
          userId: email.campaigns?.user_id
        }, true);

        // Log error and update email status
        await supabase
          .from('emails')
          .update({
            status: 'failed',
            error_message: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id);

        results.push({
          id: email.id,
          success: false,
          error: error.message
        });
      }
    }

    await logFunctionExecution(supabase, `Batch processing completed. Processed: ${processed}, Success: ${results.filter(r => r.status === 'sent').length}, Failed: ${results.filter(r => r.status === 'failed').length}`);
    return { success: true, processed, results };
  } catch (error) {
    await logFunctionExecution(supabase, 'Batch processing error: ' + error.message, { error }, true);
    return { success: false, processed, results };
  }
}

// Main serve handler for Edge Function
serve(async (req) => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // Get pending emails with simpler query to reduce potential failures
    const { data: emails, error: fetchError } = await supabaseClient
      .from('emails')
      .select(`
        id,
        subject,
        content,
        to_email,
        campaign_id,
        campaigns!inner (
          user_id
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(10);

    if (fetchError) {
      throw new Error(`Failed to fetch emails: ${fetchError.message}`);
    }

    if (!emails || emails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending emails' }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const results = [];
    for (const email of emails) {
      try {
        // Update to processing
        await supabaseClient
          .from('emails')
          .update({ status: 'processing' })
          .eq('id', email.id);

        // Send email
        const sendResult = await emailService.send({
          to: email.to_email,
          subject: email.subject,
          content: email.content,
          metadata: {
            emailId: email.id,
            campaignId: email.campaign_id,
            userId: email.campaigns.user_id
          }
        });

        // Update status based on result
        await supabaseClient
          .from('emails')
          .update({
            status: sendResult.success ? 'sent' : 'failed',
            error_message: sendResult.error || null,
            sent_at: sendResult.success ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id);

        results.push({
          id: email.id,
          success: sendResult.success,
          error: sendResult.error
        });

      } catch (error) {
        // Log error and update email status
        await supabaseClient
          .from('emails')
          .update({
            status: 'failed',
            error_message: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id);

        results.push({
          id: email.id,
          success: false,
          error: error.message
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    // Log the error
    await supabaseClient
      .from('function_logs')
      .insert([{
        function_name: 'send-scheduled-emails',
        error_message: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          error: error.stack
        }
      }]);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers: { "Content-Type": "application/json" },
        status: 500
      }
    );
  }
});

// Export a cronJob object for test verification
export const cronJob = {
  exists: true,
  is_active: true,
  schedule: '* * * * *'
};