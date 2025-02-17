-- Create contacts table
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    company TEXT,
    title TEXT,
    phone TEXT,
    status TEXT CHECK (status IN ('active', 'unsubscribed', 'bounced', 'spam')) DEFAULT 'active',
    metadata JSONB DEFAULT '{}'::JSONB,
    last_contacted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint for user_id + email
CREATE UNIQUE INDEX idx_contacts_user_email ON public.contacts(user_id, email);

-- Add indexes for better query performance
CREATE INDEX idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX idx_contacts_email ON public.contacts(email);
CREATE INDEX idx_contacts_status ON public.contacts(status);
CREATE INDEX idx_contacts_last_contacted ON public.contacts(last_contacted_at);

-- Enable RLS for contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Create policies for contacts
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'contacts' 
        AND policyname = 'Users can view own contacts'
    ) THEN
        CREATE POLICY "Users can view own contacts"
            ON public.contacts FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'contacts' 
        AND policyname = 'Users can create contacts'
    ) THEN
        CREATE POLICY "Users can create contacts"
            ON public.contacts FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'contacts' 
        AND policyname = 'Users can update own contacts'
    ) THEN
        CREATE POLICY "Users can update own contacts"
            ON public.contacts FOR UPDATE
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'contacts' 
        AND policyname = 'Users can delete own contacts'
    ) THEN
        CREATE POLICY "Users can delete own contacts"
            ON public.contacts FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- Create updated_at trigger
DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON public.contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
