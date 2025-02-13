-- First, create a table to backup any inconsistent data
CREATE TABLE IF NOT EXISTS public.data_migration_backup_20240327 (
    table_name text,
    record_id uuid,
    data jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- Clean up duplicate policies
DO $$ 
BEGIN
    -- Drop duplicate policies
    DROP POLICY IF EXISTS "Users can delete emails from own campaigns" ON public.emails;
    DROP POLICY IF EXISTS "Users can insert emails for own campaigns" ON public.emails;
    DROP POLICY IF EXISTS "Users can update emails from own campaigns" ON public.emails;
    DROP POLICY IF EXISTS "Users can view emails from own campaigns" ON public.emails;
END $$;

-- Clean up duplicate foreign key constraints
ALTER TABLE public.emails DROP CONSTRAINT IF EXISTS emails_campaign_id_fkey;

-- Add to_email column to emails table if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'emails' 
        AND column_name = 'to_email'
    ) THEN
        ALTER TABLE public.emails ADD COLUMN to_email text;
    END IF;
END $$;

-- Drop existing status check constraint if it exists
ALTER TABLE public.emails DROP CONSTRAINT IF EXISTS emails_status_check;

-- Add updated status check constraint
ALTER TABLE public.emails
    ADD CONSTRAINT emails_status_check
    CHECK (status = ANY (ARRAY['draft'::text, 'pending'::text, 'sent'::text, 'failed'::text]));

-- Backup any campaigns with invalid user_ids
INSERT INTO public.data_migration_backup_20240327 (table_name, record_id, data)
SELECT 'campaigns', c.id, row_to_json(c)::jsonb
FROM public.campaigns c
LEFT JOIN public.profiles p ON c.user_id = p.id
WHERE p.id IS NULL;

-- Backup any emails with past scheduled times
INSERT INTO public.data_migration_backup_20240327 (table_name, record_id, data)
SELECT 'emails', e.id, row_to_json(e)::jsonb
FROM public.emails e
WHERE e.status = 'pending' 
AND e.scheduled_at <= NOW();

-- Backup any emails with invalid campaign_ids
INSERT INTO public.data_migration_backup_20240327 (table_name, record_id, data)
SELECT 'emails', e.id, row_to_json(e)::jsonb
FROM public.emails e
LEFT JOIN public.campaigns c ON c.id = e.campaign_id
WHERE c.id IS NULL;

-- Backup any pending emails without recipients
INSERT INTO public.data_migration_backup_20240327 (table_name, record_id, data)
SELECT 'emails', e.id, row_to_json(e)::jsonb
FROM public.emails e
WHERE e.status = 'pending' 
AND (e.to_email IS NULL OR e.to_email = '');

-- Update past scheduled emails to be scheduled 5 minutes from now
UPDATE public.emails
SET scheduled_at = NOW() + interval '5 minutes'
WHERE status = 'pending' 
AND scheduled_at <= NOW();

-- Update pending emails without recipients to draft status
UPDATE public.emails
SET status = 'draft'
WHERE status = 'pending'
AND (to_email IS NULL OR to_email = '');

-- Delete any campaigns with invalid user_ids
DELETE FROM public.campaigns
WHERE id IN (
    SELECT c.id
    FROM public.campaigns c
    LEFT JOIN public.profiles p ON c.user_id = p.id
    WHERE p.id IS NULL
);

-- Delete any emails with invalid campaign_ids
DELETE FROM public.emails
WHERE id IN (
    SELECT e.id
    FROM public.emails e
    LEFT JOIN public.campaigns c ON c.id = e.campaign_id
    WHERE c.id IS NULL
);

-- Now add foreign key constraints
ALTER TABLE public.campaigns
    ADD CONSTRAINT fk_campaigns_user
    FOREIGN KEY (user_id)
    REFERENCES public.profiles(id)
    ON DELETE CASCADE;

ALTER TABLE public.emails
    ADD CONSTRAINT fk_emails_campaign
    FOREIGN KEY (campaign_id)
    REFERENCES public.campaigns(id)
    ON DELETE CASCADE;

-- Add indexes to improve query performance
CREATE INDEX IF NOT EXISTS idx_emails_campaign_id ON public.emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_emails_status_scheduled ON public.emails(status, scheduled_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON public.campaigns(user_id);

-- Add check constraints
ALTER TABLE public.emails
    ADD CONSTRAINT check_scheduled_at_future
    CHECK (
        (status != 'pending') OR
        (scheduled_at > NOW())
    );

-- Add check constraint to ensure pending emails have a to_email
ALTER TABLE public.emails
    ADD CONSTRAINT check_pending_has_recipient
    CHECK (
        (status != 'pending') OR
        (to_email IS NOT NULL AND to_email != '')
    );

-- Enable Row Level Security
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

-- Create policies for campaigns
CREATE POLICY "Users can view their own campaigns"
    ON public.campaigns FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own campaigns"
    ON public.campaigns FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns"
    ON public.campaigns FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns"
    ON public.campaigns FOR DELETE
    USING (auth.uid() = user_id);

-- Create policies for emails
CREATE POLICY "Users can view emails in their campaigns"
    ON public.emails FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.campaigns
        WHERE campaigns.id = emails.campaign_id
        AND campaigns.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert emails to their campaigns"
    ON public.emails FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.campaigns
        WHERE campaigns.id = emails.campaign_id
        AND campaigns.user_id = auth.uid()
    ));

CREATE POLICY "Users can update emails in their campaigns"
    ON public.emails FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.campaigns
        WHERE campaigns.id = emails.campaign_id
        AND campaigns.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.campaigns
        WHERE campaigns.id = emails.campaign_id
        AND campaigns.user_id = auth.uid()
    ));

CREATE POLICY "Users can delete emails in their campaigns"
    ON public.emails FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM public.campaigns
        WHERE campaigns.id = emails.campaign_id
        AND campaigns.user_id = auth.uid()
    ));

-- Allow the service role (used by edge functions) to access everything
CREATE POLICY "Service role can access all campaigns"
    ON public.campaigns
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role can access all emails"
    ON public.emails
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create a function to get pending emails efficiently
CREATE OR REPLACE FUNCTION public.get_pending_emails(batch_size integer DEFAULT 10)
RETURNS TABLE (
    id uuid,
    campaign_id uuid,
    subject text,
    content text,
    scheduled_at timestamptz,
    campaign_name text,
    user_id uuid,
    user_email text,
    user_name text,
    to_email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        e.id,
        e.campaign_id,
        e.subject,
        e.content,
        e.scheduled_at,
        c.name as campaign_name,
        p.id as user_id,
        p.email as user_email,
        p.full_name as user_name,
        e.to_email
    FROM emails e
    INNER JOIN campaigns c ON c.id = e.campaign_id
    INNER JOIN profiles p ON p.id = c.user_id
    WHERE e.status = 'pending'
    AND e.scheduled_at <= NOW()
    AND e.to_email IS NOT NULL
    AND e.to_email != ''  -- Only get emails that have recipients
    ORDER BY e.scheduled_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED;
$$;

-- Add sequence_type column to campaigns table
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS sequence_type text
    CHECK (sequence_type IN ('awareness', 'conversion', 'nurture'));

-- Update existing campaigns to have a default sequence_type
UPDATE public.campaigns
SET sequence_type = 'awareness'
WHERE sequence_type IS NULL;

-- Make sequence_type NOT NULL after setting defaults
ALTER TABLE public.campaigns
    ALTER COLUMN sequence_type SET NOT NULL; 