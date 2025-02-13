# Email Scheduling System Debug Notes

## Current Problem
- Scheduled email sending function (`send-scheduled-emails`) is failing with a 500 error
- Root cause: `function_logs` table doesn't exist in the database
- Function is being invoked but can't initialize properly

## Relevant Files
1. Edge Function:
   - `/supabase/functions/send-scheduled-emails/index.ts` - Main function code
   - `/supabase/functions/send-scheduled-emails/schedule.json` - Cron schedule config (runs every minute)

2. Database Migrations:
   - `/supabase/migrations/20240212_create_function_logs.sql` - Creates function_logs table
   - `/supabase/migrations/20240320_add_emails_table.sql` - Creates emails table
   - `/supabase/migrations/20240322_domain_settings.sql` - Domain verification settings
   - `/supabase/migrations/20240323_add_email_scheduling_index.sql` - Indexes for email scheduling
   - `/supabase/migrations/20240324_add_cta_links.sql` - CTA links for campaigns
   - `/supabase/migrations/20240325_add_sender_email.sql` - Sender email verification

3. Configuration:
   - `/supabase/config.toml` - Supabase project configuration

## Current State
1. Function Implementation:
   - Function code is complete and deployed
   - Includes error logging, email sending logic, and proper error handling
   - Uses SendGrid for email delivery
   - Configured to run every minute via cron

2. Database State:
   - Migrations exist but haven't been applied successfully
   - Missing critical `function_logs` table
   - Previous attempt to apply migrations failed

3. Environment:
   - All required environment variables are set:
     - SENDGRID_API_KEY
     - SUPABASE_URL
     - SUPABASE_SERVICE_ROLE_KEY
     - SUPABASE_DB_URL

## Steps Taken So Far
1. Deployed function with enhanced error logging
2. Attempted to test function with service role key
3. Identified missing `function_logs` table
4. Attempted to run `supabase db reset` (failed - service not running)
5. Attempted to run `supabase db push` (interrupted)

## Next Steps
1. Database Setup:
   - Apply pending migrations using `supabase db push`
   - Verify table creation
   - Check table permissions (RLS policies)

2. Function Testing:
   - Test function after migrations are applied
   - Monitor logs for detailed error information
   - Verify email sending capabilities

3. Verification Steps:
   - Check domain settings in database
   - Verify SendGrid domain authentication
   - Test email template rendering
   - Validate contact data access

## Required Environment
```bash
# Required Environment Variables
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_DB_URL=your_db_connection_string
SENDGRID_API_KEY=your_sendgrid_api_key
```

## Database Schema Dependencies
1. `function_logs` table:
   - Stores function execution logs and errors
   - Required for function initialization

2. `emails` table:
   - Stores email content and scheduling info
   - Status tracking (pending, sent, failed)
   - Campaign association

3. `domain_settings` table:
   - Stores verified sending domains
   - SendGrid domain authentication status
   - DNS records for verification

4. `contacts` table:
   - Stores recipient information
   - Campaign associations
   - Engagement tracking

## Common Issues & Solutions
1. Database Connection:
   - Ensure service role key has proper permissions
   - Verify database URL is correct
   - Check RLS policies

2. SendGrid Integration:
   - Verify API key permissions
   - Check domain verification status
   - Validate sender email addresses

3. Function Execution:
   - Monitor function logs
   - Check for timeout issues
   - Verify cron schedule

## Testing Plan
1. Database Verification:
   ```sql
   -- Check function_logs table
   SELECT * FROM function_logs ORDER BY timestamp DESC LIMIT 5;
   
   -- Check pending emails
   SELECT * FROM emails 
   WHERE status = 'pending' 
   AND scheduled_at <= NOW() 
   ORDER BY scheduled_at;
   
   -- Check domain settings
   SELECT * FROM domain_settings 
   WHERE status = 'verified';
   ```

2. Function Testing:
   ```bash
   # Test function with debug mode
   curl -i -X POST "https://gbqvyayctkauyfehvpxk.supabase.co/functions/v1/send-scheduled-emails" \
   -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
   -H "Content-Type: application/json" \
   -d '{"debug": true}'
   ```

## Notes for Future Development
1. Consider adding:
   - Retry mechanism for failed emails
   - Batch processing for large email volumes
   - Rate limiting for SendGrid API
   - Better error categorization
   - Email template versioning

2. Monitoring Improvements:
   - Add performance metrics
   - Track email delivery rates
   - Monitor queue sizes
   - Alert on high failure rates 