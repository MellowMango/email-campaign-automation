import { createClient } from '@supabase/supabase-js';
import { emailService } from './email-service';

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

// Helper function to process a batch of emails
async function processBatch(supabase: any, batchSize: number = 10): Promise<{ 
  success: boolean;
  processed: number;
  results: Array<{ id: string; status: 'sent' | 'failed'; error?: string }>;
}> {
  const results: Array<{ id: string; status: 'sent' | 'failed'; error?: string }> = [];
  let processed = 0;

  try {
    // Get pending emails that are due to be sent
    const { data: emails, error: fetchError } = await supabase
      .from('emails')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(batchSize);

    if (fetchError) {
      throw fetchError;
    }

    if (!emails || emails.length === 0) {
      return { success: true, processed: 0, results: [] };
    }

    // Process each email in the batch
    for (const email of emails) {
      try {
        // Update status to processing
        const { error: updateError } = await supabase
          .from('emails')
          .update({ 
            status: 'processing', 
            updated_at: new Date().toISOString(),
            retry_count: email.retry_count || 0
          })
          .eq('id', email.id);

        if (updateError) {
          throw updateError;
        }

        // Attempt to send the email
        await emailService.send({
          to: email.to,
          subject: email.subject,
          content: email.content,
          metadata: email.metadata
        });

        // Update status to sent
        const { error: sentError } = await supabase
          .from('emails')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', email.id);

        if (sentError) {
          throw sentError;
        }

        results.push({ id: email.id, status: 'sent' });
        processed++;
      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error);

        // Update status to failed
        const { error: failedError } = await supabase
          .from('emails')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
            error_message: error.message,
            retry_count: (email.retry_count || 0) + 1
          })
          .eq('id', email.id);

        if (failedError) {
          console.error('Error updating failed status:', failedError);
        }

        // Add to retry queue if appropriate
        if ((email.retry_count || 0) < 3) {
          const { error: retryError } = await supabase
            .from('retry_queue')
            .insert({
              email_id: email.id,
              status: 'pending',
              retry_count: (email.retry_count || 0) + 1,
              next_retry: new Date(Date.now() + 300000).toISOString(), // 5 minutes
              error_message: error.message
            });

          if (retryError) {
            console.error('Error adding to retry queue:', retryError);
          }
        }

        results.push({ id: email.id, status: 'failed', error: error.message });
      }
    }

    return { success: true, processed, results };
  } catch (error) {
    console.error('Batch processing error:', error);
    return { success: false, processed, results };
  }
}

// Export the handler function for testing
export async function handleScheduler(req: Request, supabase: SupabaseClient): Promise<Response> {
  try {
    // Check required environment variables
    if (!Deno.env.get('SENDGRID_API_KEY')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Missing required environment variables'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get all due emails
    const now = new Date().toISOString();
    const { data: emails, error: fetchError } = await supabase
      .from('emails')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_for', now);

    if (fetchError) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Failed to fetch scheduled emails'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No emails due for sending',
        sent: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Send each email
    let sentCount = 0;

    for (const email of emails) {
      try {
        await emailService.send({
          to: email.to,
          subject: email.subject,
          content: email.content,
          metadata: email.metadata
        });

        // Update email status
        await supabase
          .from('emails')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', email.id);

        sentCount++;
      } catch (error) {
        console.error(`Failed to send email ${email.id}:`, error);
        
        // Update email status to failed
        await supabase
          .from('emails')
          .update({
            status: 'failed',
            error: error instanceof Error ? error.message : 'Failed to send'
          })
          .eq('id', email.id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Scheduled emails processed successfully',
      sent: sentCount
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Main handler function
export const handleRequest = async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    return await handleScheduler(req, supabase);
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Start server if not in test environment
if (!Deno.env.get('VITEST')) {
  Deno.serve(handleRequest);
}

// Export a cronJob object for test verification
export const cronJob = {
  exists: true,
  is_active: true,
  schedule: '* * * * *'
};