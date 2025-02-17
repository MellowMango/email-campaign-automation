-- Create custom settings table
CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add RLS policies
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to app_settings"
    ON app_settings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to read settings
CREATE POLICY "Authenticated users can read app_settings"
    ON app_settings
    FOR SELECT
    TO authenticated
    USING (true);

-- Insert default settings
INSERT INTO app_settings (key, value, description) VALUES
    ('project_url', 'http://localhost:54321', 'Supabase project URL'),
    ('anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.OXBO6PqNBNgFdcLUuZBoBLAsApfOXO9Er2JLutPq1PI', 'Supabase anonymous key')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();

-- Create function to get setting
CREATE OR REPLACE FUNCTION get_setting(p_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_value text;
BEGIN
    SELECT value INTO v_value
    FROM app_settings
    WHERE key = p_key;
    
    RETURN v_value;
END;
$$;

-- Grant necessary permissions
GRANT SELECT ON app_settings TO authenticated;
GRANT EXECUTE ON FUNCTION get_setting TO authenticated; 