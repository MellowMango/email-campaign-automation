-- Create emails table
CREATE TABLE IF NOT EXISTS public.emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    status TEXT CHECK (status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

-- Create policies for emails
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

-- Create trigger for updated_at
CREATE TRIGGER update_emails_updated_at
    BEFORE UPDATE ON public.emails
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create ai_logs table for tracking content generation
CREATE TABLE IF NOT EXISTS public.ai_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
    email_id UUID REFERENCES public.emails(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for ai_logs
CREATE POLICY "Users can view ai_logs from own campaigns"
    ON public.ai_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = ai_logs.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert ai_logs for own campaigns"
    ON public.ai_logs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE campaigns.id = ai_logs.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    ); 