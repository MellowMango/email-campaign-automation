-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    full_name TEXT,
    company_name TEXT,
    role TEXT,
    avatar_url TEXT
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Users can view own profile'
    ) THEN
        CREATE POLICY "Users can view own profile"
            ON public.profiles FOR SELECT
            USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Users can update own profile'
    ) THEN
        CREATE POLICY "Users can update own profile"
            ON public.profiles FOR UPDATE
            USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname = 'Users can insert own profile'
    ) THEN
        CREATE POLICY "Users can insert own profile"
            ON public.profiles FOR INSERT
            WITH CHECK (auth.uid() = id);
    END IF;
END $$;

-- Create campaigns table
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK (status IN ('draft', 'active', 'paused', 'completed')) DEFAULT 'draft',
    target_audience TEXT,
    email_template TEXT,
    personalization_rules JSONB,
    analytics JSONB DEFAULT '{"sent": 0, "opened": 0, "clicked": 0, "replied": 0}'::JSONB
);

-- Enable Row Level Security
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Create policies for campaigns
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'campaigns' 
        AND policyname = 'Users can view own campaigns'
    ) THEN
        CREATE POLICY "Users can view own campaigns"
            ON public.campaigns FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'campaigns' 
        AND policyname = 'Users can create campaigns'
    ) THEN
        CREATE POLICY "Users can create campaigns"
            ON public.campaigns FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'campaigns' 
        AND policyname = 'Users can update own campaigns'
    ) THEN
        CREATE POLICY "Users can update own campaigns"
            ON public.campaigns FOR UPDATE
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'campaigns' 
        AND policyname = 'Users can delete own campaigns'
    ) THEN
        CREATE POLICY "Users can delete own campaigns"
            ON public.campaigns FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- Create contacts table
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    campaign_id UUID REFERENCES public.campaigns(id),
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    company TEXT,
    position TEXT,
    linkedin_url TEXT,
    status TEXT CHECK (status IN ('new', 'contacted', 'responded', 'converted', 'unsubscribed')) DEFAULT 'new',
    last_contacted TIMESTAMPTZ,
    notes TEXT,
    custom_fields JSONB
);

-- Enable Row Level Security
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

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON public.campaigns;
CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON public.campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON public.contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at, updated_at)
  VALUES (
    new.id,
    new.email,
    now(),
    now()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user(); 