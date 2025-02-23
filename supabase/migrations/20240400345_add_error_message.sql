-- Add error_message column to emails table
ALTER TABLE public.emails
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Grant necessary permissions
GRANT ALL ON TABLE public.emails TO authenticated;
GRANT ALL ON TABLE public.emails TO service_role; 