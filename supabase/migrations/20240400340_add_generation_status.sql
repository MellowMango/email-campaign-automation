-- Create generation_status table
CREATE TABLE IF NOT EXISTS public.generation_status (
    campaign_id UUID PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('generating', 'completed', 'error')),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    current_batch INTEGER NOT NULL DEFAULT 0,
    total_emails INTEGER,
    completed_emails INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_generation_status_status ON public.generation_status(status);
CREATE INDEX IF NOT EXISTS idx_generation_status_updated_at ON public.generation_status(updated_at);

-- Enable RLS
ALTER TABLE public.generation_status ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users
GRANT ALL ON public.generation_status TO authenticated;
GRANT ALL ON public.generation_status TO service_role;

-- RLS policies
CREATE POLICY "Users can manage their own generation status"
    ON public.generation_status
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = generation_status.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = generation_status.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    );

-- Function to clean up old generation status
CREATE OR REPLACE FUNCTION clean_old_generation_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Delete generation status older than 24 hours
    DELETE FROM public.generation_status
    WHERE updated_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- Create a cron job to clean up old generation status
SELECT cron.schedule(
    'clean-generation-status',  -- name of the cron job
    '0 * * * *',               -- run every hour
    'SELECT clean_old_generation_status()'
); 