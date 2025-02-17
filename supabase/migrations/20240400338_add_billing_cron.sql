-- Create app_settings table if not exists
CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Insert or update default settings
INSERT INTO app_settings (key, value, description)
VALUES 
    ('project_url', COALESCE(current_setting('supabase.project_url', true), 'http://localhost:54321'), 'Supabase project URL'),
    ('anon_key', COALESCE(current_setting('supabase.anon_key', true), 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.OXBO6PqNBNgFdcLUuZBoBLAsApfOXO9Er2JLutPq1PI'), 'Supabase anonymous key')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();

-- Add RLS policies to app_settings
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Service role has full access to app_settings" ON app_settings;
DROP POLICY IF EXISTS "Authenticated users can read app_settings" ON app_settings;

-- Create policies
CREATE POLICY "Service role has full access to app_settings"
    ON app_settings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users can read app_settings"
    ON app_settings
    FOR SELECT
    TO authenticated
    USING (true);

-- Create logs table if not exists
CREATE TABLE IF NOT EXISTS logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    level text NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add RLS policies to logs table
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Service role has full access to logs" ON logs;
DROP POLICY IF EXISTS "Authenticated users can read logs" ON logs;

-- Create policies
CREATE POLICY "Service role has full access to logs"
    ON logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Authenticated users can read logs"
    ON logs
    FOR SELECT
    TO authenticated
    USING (true);

-- Create the billing calculation function
CREATE OR REPLACE FUNCTION calculate_daily_billing()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Log start of job
    INSERT INTO logs (level, message) VALUES ('info', 'Starting daily billing calculation');
    
    -- Make HTTP request to billing function
    PERFORM net.http_post(
        COALESCE(current_setting('SUPABASE_URL', true), 'http://localhost:54321') || '/functions/v1/calculate-usage-billing',
        jsonb_build_object('timestamp', extract(epoch from now())),
        jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(current_setting('SUPABASE_ANON_KEY', true), 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.OXBO6PqNBNgFdcLUuZBoBLAsApfOXO9Er2JLutPq1PI')
        )
    );
    
    -- Log successful completion
    INSERT INTO logs (level, message) VALUES ('info', 'Daily billing calculation completed successfully');
EXCEPTION WHEN OTHERS THEN
    -- Log any errors that occur
    INSERT INTO logs (level, message, metadata) 
    VALUES ('error', 'Error in daily billing calculation: ' || SQLERRM, 
            jsonb_build_object('error_detail', SQLSTATE || ': ' || SQLERRM));
    RAISE;
END;
$$;

-- Schedule the job (will replace if exists)
SELECT cron.schedule('calculate_daily_usage_billing', '0 0 * * *', 'SELECT calculate_daily_billing();');

-- Verify the job is scheduled
SELECT count(*) > 0 as job_exists 
FROM cron.job 
WHERE jobname = 'calculate_daily_usage_billing';

-- Verify setup
DO $$
DECLARE
    v_test_results text[];
    v_result text;
BEGIN
    RAISE NOTICE 'Starting billing setup verification...';
    RAISE NOTICE '----------------------------';
    
    -- Test 1: Verify required extensions
    BEGIN
        PERFORM 1 FROM pg_extension WHERE extname = 'pg_net';
        RAISE NOTICE 'PASS: pg_net extension is installed';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL: pg_net extension is not installed - %', SQLERRM;
    END;
    
    BEGIN
        PERFORM 1 FROM pg_extension WHERE extname = 'pg_cron';
        RAISE NOTICE 'PASS: pg_cron extension is installed';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL: pg_cron extension is not installed - %', SQLERRM;
    END;
    
    -- Test 2: Verify app_settings
    BEGIN
        PERFORM value FROM app_settings WHERE key IN ('project_url', 'anon_key');
        RAISE NOTICE 'PASS: app_settings contains required configuration';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL: app_settings verification failed - %', SQLERRM;
    END;
    
    -- Test 3: Verify cron job
    BEGIN
        PERFORM 1 FROM cron.job WHERE jobname = 'calculate_daily_usage_billing';
        RAISE NOTICE 'PASS: Billing cron job is scheduled';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FAIL: Billing cron job is not scheduled - %', SQLERRM;
    END;
    
    RAISE NOTICE '----------------------------';
    RAISE NOTICE 'Verification completed.';
END $$; 