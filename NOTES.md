# Email Scheduling System Debug Notes

## Current Problem
- Scheduled email sending function (`send-scheduled-emails`) is failing with multiple issues:
  1. Initial error: `function_logs` table doesn't exist in the database
  2. After fixing env vars: Relationship errors between tables
  3. Infrastructure issue: Edge function server keeps crashing with exit code 137
- Function is being invoked but has various initialization and query issues

## Relevant Files
1. Edge Function:
   - `/supabase/functions/send-scheduled-emails/index.ts` - Main function code
   - `/supabase/functions/send-scheduled-emails/schedule.json` - Cron schedule config (runs every minute)
   - `/supabase/functions/send-scheduled-emails/.env` - Local environment variables
   - `/supabase/functions/send-scheduled-emails/.env.local` - Local override variables

2. Database Migrations:
   - `/supabase/migrations/20240212_create_function_logs.sql` - Creates function_logs table
   - `/supabase/migrations/20240320_add_emails_table.sql` - Creates emails table
   - `/supabase/migrations/20240322_domain_settings.sql` - Domain verification settings
   - `/supabase/migrations/20240323_add_email_scheduling_index.sql` - Indexes for email scheduling
   - `/supabase/migrations/20240324_add_cta_links.sql` - CTA links for campaigns
   - `/supabase/migrations/20240325_add_sender_email.sql` - Sender email verification
   - `/supabase/migrations/20240326_consolidated_schema.sql` - Latest consolidated schema

3. Configuration:
   - `/supabase/config.toml` - Supabase project configuration
   - `.env` - Root environment variables

## Current State
1. Function Implementation:
   - Function code is complete and deployed
   - Includes error logging, email sending logic, and proper error handling
   - Uses SendGrid for email delivery
   - Configured to run every minute via cron

2. Database State:
   - Schema is defined but relationship queries are failing
   - Getting errors about missing relationships between tables
   - Previous attempt to apply migrations failed

3. Environment:
   - Environment variables now properly set:
     - SENDGRID_API_KEY
     - SUPABASE_URL
     - SUPABASE_SERVICE_ROLE_KEY
     - SUPABASE_DB_URL

## Infrastructure Issues
1. Edge Function Server:
   - Running `supabase functions serve --env-file .env | cat` consistently crashes
   - Server exits with code 137 (OOM killer)
   - Each attempt runs for about 1-2 minutes before crashing
   - Logs show successful initialization but then container dies

2. Database Relationship Errors:
   - Error 1: "column campaigns_1.company_name does not exist"
   - Error 2: "Could not find a relationship between 'campaigns' and 'profiles'"
   - Error 3: "Could not find a relationship between 'campaigns' and 'user_id'"

## Steps Taken So Far
1. Environment Setup:
   - Fixed missing SENDGRID_API_KEY issue
   - Verified all environment variables are present
   - Confirmed Supabase connection works

2. Function Testing:
   - Multiple attempts to run function locally
   - Each attempt shows different relationship errors
   - Function successfully initializes but fails on database queries

3. Database Investigation:
   - Reviewed schema relationships
   - Found mismatches between code queries and actual schema
   - Identified missing foreign key relationships

4. Infrastructure:
   - Multiple attempts to run edge function server
   - Server consistently crashes with OOM
   - Added logging to track function execution

## Next Steps
1. Database Fixes:
   - Review and fix table relationships
   - Verify foreign key constraints
   - Update queries to match actual schema

2. Infrastructure:
   - Investigate OOM crashes
   - Consider resource limits for edge function
   - Look into alternative deployment methods

3. Function Updates:
   - Simplify database queries
   - Add better error handling for relationship issues
   - Implement retry mechanism

4. Testing Plan:
   - Test each database relationship separately
   - Verify query structure matches schema
   - Monitor memory usage during execution

## Common Issues & Solutions
1. Database Connection:
   - Service role key works but queries fail
   - Relationship errors indicate schema mismatch
   - Need to align code with actual database structure

2. SendGrid Integration:
   - API key now working
   - Need to verify sender email addresses
   - Check domain verification status

3. Function Execution:
   - OOM kills indicate memory leak or resource issue
   - Need to optimize query patterns
   - Consider batch processing

## Testing Plan
1. Database Verification:
   ```sql
   -- Check table relationships
   SELECT
      tc.table_schema, 
      tc.constraint_name, 
      tc.table_name, 
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
   FROM information_schema.table_constraints AS tc
   JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
   JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
   WHERE tc.constraint_type = 'FOREIGN KEY';
   ```

2. Function Testing:
   ```bash
   # Test with debug output
   curl -i -X POST "http://localhost:54321/functions/v1/send-scheduled-emails" \
   -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
   -H "Content-Type: application/json" \
   -d '{"debug": true}'
   ```

## Notes for Future Development
1. Consider:
   - Implementing circuit breaker for database queries
   - Adding query timeouts
   - Implementing proper connection pooling
   - Better memory management in edge function

2. Monitoring Improvements:
   - Add detailed query logging
   - Track memory usage
   - Monitor container health
   - Log relationship errors separately

3. Infrastructure:
   - Consider increasing container resources
   - Look into function cold starts
   - Implement proper error recovery
   - Add health checks

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