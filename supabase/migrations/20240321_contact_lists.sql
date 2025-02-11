-- Create contact_lists table
CREATE TABLE IF NOT EXISTS public.contact_lists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK (type IN ('manual', 'dynamic', 'segment')) DEFAULT 'manual',
    rules JSONB DEFAULT '{}'::JSONB,
    metadata JSONB DEFAULT '{}'::JSONB
);

-- Create contact_list_members junction table
CREATE TABLE IF NOT EXISTS public.contact_list_members (
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    list_id UUID REFERENCES public.contact_lists(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    score INTEGER DEFAULT 0,
    engagement_metrics JSONB DEFAULT '{"opens": 0, "clicks": 0, "replies": 0}'::JSONB,
    PRIMARY KEY (contact_id, list_id)
);

-- Add engagement_score and last_engagement to contacts table
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_engagement TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;

-- Enable RLS
ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_list_members ENABLE ROW LEVEL SECURITY;

-- Create policies for contact_lists
CREATE POLICY "Users can view own contact lists"
    ON public.contact_lists FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create contact lists"
    ON public.contact_lists FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contact lists"
    ON public.contact_lists FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contact lists"
    ON public.contact_lists FOR DELETE
    USING (auth.uid() = user_id);

-- Create policies for contact_list_members
CREATE POLICY "Users can view own contact list members"
    ON public.contact_list_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.contact_lists
            WHERE contact_lists.id = contact_list_members.list_id
            AND contact_lists.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own contact list members"
    ON public.contact_list_members FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.contact_lists
            WHERE contact_lists.id = contact_list_members.list_id
            AND contact_lists.user_id = auth.uid()
        )
    );

-- Create function to update contact engagement score
CREATE OR REPLACE FUNCTION update_contact_engagement_score()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.contacts
    SET 
        engagement_score = (
            COALESCE((NEW.engagement_metrics->>'opens')::int, 0) * 1 +
            COALESCE((NEW.engagement_metrics->>'clicks')::int, 0) * 2 +
            COALESCE((NEW.engagement_metrics->>'replies')::int, 0) * 3
        ),
        last_engagement = NOW()
    WHERE id = NEW.contact_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for updating engagement score
CREATE TRIGGER update_contact_engagement_score_trigger
    AFTER UPDATE OF engagement_metrics ON public.contact_list_members
    FOR EACH ROW
    EXECUTE FUNCTION update_contact_engagement_score(); 