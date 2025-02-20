-- Drop existing status check constraint
ALTER TABLE public.emails DROP CONSTRAINT IF EXISTS emails_status_check;

-- Add updated status check constraint
ALTER TABLE public.emails
    ADD CONSTRAINT emails_status_check
    CHECK (status = ANY (ARRAY['draft'::text, 'pending'::text, 'sent'::text, 'failed'::text]));

-- Drop existing RLS policies for emails
DROP POLICY IF EXISTS "Users can view emails from own campaigns" ON public.emails;
DROP POLICY IF EXISTS "Users can insert emails for own campaigns" ON public.emails;
DROP POLICY IF EXISTS "Users can update emails from own campaigns" ON public.emails;
DROP POLICY IF EXISTS "Users can delete emails from own campaigns" ON public.emails;
DROP POLICY IF EXISTS "Service role can access all emails" ON public.emails;

-- Create updated RLS policies for emails
CREATE POLICY "Users can view emails from own campaigns"
    ON public.emails FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = emails.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert emails for own campaigns"
    ON public.emails FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = emails.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update emails from own campaigns"
    ON public.emails FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = emails.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = emails.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete emails from own campaigns"
    ON public.emails FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = emails.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    );

-- Service role policy
CREATE POLICY "Service role can access all emails"
    ON public.emails FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Refresh the RLS policies
ALTER TABLE public.emails DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY; 