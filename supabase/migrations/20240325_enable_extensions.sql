-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "cron";
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";

-- Create function to check cron job status
CREATE OR REPLACE FUNCTION check_cron_job(job_name text)
RETURNS TABLE (
    job_exists boolean,
    is_active boolean,
    schedule text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cron, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        true as job_exists,
        active as is_active,
        schedule
    FROM cron.job
    WHERE jobname = job_name;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, false, null::text;
    END IF;
END;
$$;

-- Verify extensions are enabled
DO $$
BEGIN
    RAISE NOTICE 'Verifying extensions...';
    
    -- Check pg_cron
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE NOTICE 'pg_cron extension is installed';
    ELSE
        RAISE EXCEPTION 'pg_cron extension is not installed';
    END IF;
    
    -- Check pg_net
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        RAISE NOTICE 'pg_net extension is installed';
    ELSE
        RAISE EXCEPTION 'pg_net extension is not installed';
    END IF;
END $$; 