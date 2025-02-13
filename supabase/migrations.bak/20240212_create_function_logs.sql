-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create function_logs table
CREATE TABLE IF NOT EXISTS public.function_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    function_name text NOT NULL,
    error_message text NOT NULL,
    error_stack text,
    metadata jsonb,
    timestamp timestamptz NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_function_logs_timestamp ON public.function_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_function_logs_function_name ON public.function_logs(function_name);

-- Add RLS policies
ALTER TABLE public.function_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to function logs"
    ON public.function_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to read logs
CREATE POLICY "Authenticated users can read function logs"
    ON public.function_logs
    FOR SELECT
    TO authenticated
    USING (true); 