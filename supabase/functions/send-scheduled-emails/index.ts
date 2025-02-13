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
    
    if (!supabase) {
      console.error('Cannot log to database: Supabase client is not initialized');
      return;
    }
    
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

Deno.serve(async (req) => {
  let supabase;
  
  try {
    const startTime = new Date();
    console.log('Function started at:', startTime.toISOString());

    // Log request details
    const headers = Object.fromEntries(req.headers.entries());
    console.log('Request headers:', JSON.stringify(headers, null, 2));

    // Validate authorization
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('No authorization header present');
      throw new Error('Missing authorization header');
    }
    console.log('Authorization header present:', authHeader.substring(0, 15) + '...');

    // Get environment variables directly
    const sendgridKey = Deno.env.get('SENDGRID_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'http://127.0.0.1:54321';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('Environment variables check:');
    console.log('- SendGrid API Key:', sendgridKey ? 'Present' : 'Missing');
    console.log('- Supabase URL:', supabaseUrl ? 'Present' : 'Missing');
    console.log('- Supabase Service Key:', supabaseServiceKey ? 'Present' : 'Missing');

    const missingVars = [];
    if (!sendgridKey) missingVars.push('SENDGRID_API_KEY');
    if (!supabaseUrl) missingVars.push('SUPABASE_URL');
    if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY');

    if (missingVars.length > 0) {
      console.error('Environment variables missing:', missingVars);
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Initialize Supabase first so we can log errors
    console.log('Initializing Supabase client...');
    try {
      if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Missing required environment variables:', {
          hasUrl: !!supabaseUrl,
          hasServiceKey: !!supabaseServiceKey
        });
        throw new Error('Cannot initialize Supabase client: Missing URL or service key');
      }

      console.log('Environment variables present, creating client...');
      console.log('Supabase URL:', supabaseUrl);
      
      try {
        supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        });
      } catch (createError) {
        console.error('Error creating Supabase client:', {
          error: createError,
          message: createError.message,
          stack: createError.stack
        });
        throw createError;
      }

      if (!supabase) {
        console.error('Supabase client is null after successful creation');
        throw new Error('Supabase client is null after initialization');
      }

      console.log('Supabase client created, testing connection...');
      
      try {
        const { data, error: testError } = await supabase
          .from('emails')
          .select('id')
          .limit(1);
        
        console.log('Test query response:', { data, error: testError });
        
        if (testError) {
          console.error('Test query failed:', testError);
          throw new Error(`Connection test failed: ${testError.message}`);
        }
        
        console.log('Supabase connection test successful');
      } catch (queryError) {
        console.error('Error during test query:', {
          error: queryError,
          message: queryError.message,
          stack: queryError.stack
        });
        throw queryError;
      }
    } catch (error) {
      console.error('Supabase initialization error:', {
        error,
        message: error.message,
        name: error.name,
        stack: error.stack,
        cause: error.cause
      });

      return new Response(
        JSON.stringify({
          error: 'Database connection failed',
          details: error.message,
          stage: 'initialization',
          timestamp: new Date().toISOString(),
          error_info: {
            name: error.name,
            stack: error.stack,
            cause: error.cause
          }
        }),
        { 
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'X-Error-Stage': 'supabase_init',
            'X-Error-Type': error.constructor.name
          }
        }
      );
    }

    // Initialize SendGrid clients
    console.log('Initializing SendGrid clients...');
    const client = new Client();
    const mailService = new MailService();

    try {
      client.setApiKey(sendgridKey);
      mailService.setApiKey(sendgridKey);
      console.log('SendGrid clients initialized successfully');
    } catch (error) {
      console.error('Error initializing SendGrid clients:', error);
      await logError(supabase, error, { stage: 'sendgrid_init' });
      throw error;
    }

    // Get all pending emails
    const now = new Date();
    console.log('Checking for emails scheduled before:', now.toISOString());

    console.log('Querying pending emails...');
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select(`
        *,
        campaigns!inner (
          user_id,
          name
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', now.toISOString())
      .order('scheduled_at');

    if (emailsError) {
      console.error('Error fetching emails:', emailsError);
      await logError(supabase, emailsError, { stage: 'fetch_emails' });
      throw emailsError;
    }

    console.log('Found emails:', emails?.length || 0);

    if (!emails || emails.length === 0) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      console.log(`Function completed successfully in ${duration}ms - No emails to send`);
      
      return new Response(
        JSON.stringify({ 
          message: 'No emails to send',
          duration: `${duration}ms`
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Process each email
    const results = await Promise.all(
      emails.map(async (email) => {
        try {
          console.log('Processing email:', email.id);

          // Get contacts for this campaign
          console.log('Fetching contacts for campaign:', email.campaign_id);
          const { data: contacts, error: contactsError } = await supabase
            .from('contacts')
            .select('*')
            .eq('campaign_id', email.campaign_id);

          if (contactsError) {
            console.error('Error fetching contacts:', contactsError);
            throw contactsError;
          }

          if (!contacts || contacts.length === 0) {
            console.log('No contacts found for campaign:', email.campaign_id);
            throw new Error('No contacts found for campaign');
          }

          console.log('Found contacts:', contacts.length);

          // Get user profile
          console.log('Fetching user profile:', email.campaigns.user_id);
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', email.campaigns.user_id)
            .single();

          if (profileError) {
            console.error('Error fetching profile:', profileError);
            throw profileError;
          }

          if (!profile) {
            console.error('No profile found for user:', email.campaigns.user_id);
            throw new Error('No profile found for user');
          }

          // Get domain settings
          console.log('Fetching domain settings for user:', email.campaigns.user_id);
          const { data: domainSettings, error: domainError } = await supabase
            .from('domain_settings')
            .select('*')
            .eq('user_id', email.campaigns.user_id)
            .single();

          if (domainError) {
            console.error('Error fetching domain settings:', domainError);
            throw domainError;
          }

          if (!domainSettings) {
            console.error('No domain settings found for user:', email.campaigns.user_id);
            throw new Error('No domain settings found for user');
          }

          if (!domainSettings.sender_email || !domainSettings.sender_verified) {
            console.error('Sender email not verified:', domainSettings.sender_email);
            throw new Error('Sender email not verified');
          }

          console.log('Using sender email:', domainSettings.sender_email);

          // Send email to each contact
          const emailPromises = contacts.map(async (contact) => {
            try {
              const msg = {
                to: contact.email,
                from: domainSettings.sender_email,
                subject: email.subject,
                html: email.content,
                personalizations: [{
                  to: [{ email: contact.email }],
                  dynamic_template_data: {
                    first_name: contact.first_name,
                    last_name: contact.last_name,
                    company: profile.company_name || ''
                  }
                }]
              };

              console.log('Sending email to:', contact.email);
              await mailService.send(msg);
              console.log('Email sent successfully to:', contact.email);

              return { success: true, contact: contact.email };
            } catch (sendError) {
              console.error('Error sending email to:', contact.email, sendError);
              return { success: false, contact: contact.email, error: sendError };
            }
          });

          const sendResults = await Promise.all(emailPromises);
          console.log('Email send results:', sendResults);

          // Update email status
          const successCount = sendResults.filter(r => r.success).length;
          const failureCount = sendResults.filter(r => !r.success).length;

          const status = failureCount === 0 ? 'sent' : 
                        successCount === 0 ? 'failed' : 'partial';

          console.log('Updating email status to:', status);
          const { error: updateError } = await supabase
            .from('emails')
            .update({ 
              status,
              sent_at: new Date().toISOString(),
              metadata: {
                success_count: successCount,
                failure_count: failureCount,
                results: sendResults
              }
            })
            .eq('id', email.id);

          if (updateError) {
            console.error('Error updating email status:', updateError);
            throw updateError;
          }

          return { 
            email_id: email.id,
            campaign_id: email.campaign_id,
            status,
            success_count: successCount,
            failure_count: failureCount,
            results: sendResults
          };
        } catch (error) {
          console.error('Error processing email:', email.id, error);
          await logError(supabase, error, { 
            stage: 'process_email',
            email_id: email.id,
            campaign_id: email.campaign_id
          });

          // Update email status to failed
          const { error: updateError } = await supabase
            .from('emails')
            .update({ 
              status: 'failed',
              metadata: {
                error: error.message,
                stack: error.stack
              }
            })
            .eq('id', email.id);

          if (updateError) {
            console.error('Error updating email status:', updateError);
          }

          return { 
            email_id: email.id,
            campaign_id: email.campaign_id,
            status: 'failed',
            error: error.message
          };
        }
      })
    );

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    console.log(`Function completed successfully in ${duration}ms`);

    return new Response(
      JSON.stringify({
        message: 'Emails processed',
        results,
        duration: `${duration}ms`
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unhandled error:', error);
    await logError(supabase, error, { stage: 'unhandled' });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
});