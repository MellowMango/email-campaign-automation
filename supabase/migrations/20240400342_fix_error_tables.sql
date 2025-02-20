-- Drop existing foreign key constraints
ALTER TABLE public.email_errors
    DROP CONSTRAINT IF EXISTS email_errors_email_id_fkey;

-- Modify email_id to be nullable
ALTER TABLE public.email_errors
    ALTER COLUMN email_id DROP NOT NULL;

-- Re-add foreign key with ON DELETE SET NULL
ALTER TABLE public.email_errors
    ADD CONSTRAINT email_errors_email_id_fkey
    FOREIGN KEY (email_id)
    REFERENCES public.emails(id)
    ON DELETE SET NULL;

-- Modify retry_queue to handle null email_id
ALTER TABLE public.retry_queue
    ALTER COLUMN email_id DROP NOT NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_email_errors_campaign_id ON public.email_errors(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_errors_created_at ON public.email_errors(created_at);

-- Update existing records if any
UPDATE public.email_errors
SET email_id = NULL
WHERE email_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM public.emails
    WHERE emails.id = email_errors.email_id
); 