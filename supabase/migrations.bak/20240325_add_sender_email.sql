-- Add sender email to domain_settings table
ALTER TABLE public.domain_settings
ADD COLUMN sender_email TEXT,
ADD COLUMN sender_verified BOOLEAN DEFAULT FALSE;

-- Add index for sender email
CREATE INDEX domain_settings_sender_email_idx ON domain_settings(sender_email);

-- Update the status check constraint to include 'sender_pending'
ALTER TABLE public.domain_settings
DROP CONSTRAINT domain_settings_status_check,
ADD CONSTRAINT domain_settings_status_check 
CHECK (status IN ('pending', 'verified', 'failed', 'sender_pending')); 