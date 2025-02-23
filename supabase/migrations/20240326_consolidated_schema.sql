-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create function_logs table
CREATE TABLE IF NOT EXISTS public.function_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    function_name text NOT NULL,
    error_message text NOT NULL,
    error_stack text,
    metadata jsonb,
    timestamp timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for function_logs
CREATE INDEX IF NOT EXISTS idx_function_logs_timestamp ON public.function_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_function_logs_function_name ON public.function_logs(function_name);

-- Enable RLS for function_logs
ALTER TABLE public.function_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for function_logs
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'function_logs' 
        AND policyname = 'Service role has full access to function logs'
    ) THEN
        CREATE POLICY "Service role has full access to function logs"
            ON public.function_logs
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'function_logs' 
        AND policyname = 'Authenticated users can read function logs'
    ) THEN
        CREATE POLICY "Authenticated users can read function logs"
            ON public.function_logs
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;

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

-- Enable RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
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

-- Enable RLS for campaigns
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

-- Create emails table
CREATE TABLE IF NOT EXISTS public.emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    status TEXT CHECK (status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for emails
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view emails from own campaigns" ON public.emails;
DROP POLICY IF EXISTS "Users can insert emails for own campaigns" ON public.emails;
DROP POLICY IF EXISTS "Users can update emails from own campaigns" ON public.emails;
DROP POLICY IF EXISTS "Users can delete emails from own campaigns" ON public.emails;

-- Create policies for emails
CREATE POLICY "Service role can insert emails"
    ON public.emails FOR INSERT
    TO service_role
    WITH CHECK (true);

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
            WHERE campaigns.id = campaign_id
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

-- Create ai_logs table
CREATE TABLE IF NOT EXISTS public.ai_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
    email_id UUID REFERENCES public.emails(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for ai_logs
ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for ai_logs
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'ai_logs' 
        AND policyname = 'Users can view ai_logs from own campaigns'
    ) THEN
        CREATE POLICY "Users can view ai_logs from own campaigns"
            ON public.ai_logs FOR SELECT
            USING (
                EXISTS (
                    SELECT 1 FROM public.campaigns
                    WHERE campaigns.id = ai_logs.campaign_id
                    AND campaigns.user_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'ai_logs' 
        AND policyname = 'Users can insert ai_logs for own campaigns'
    ) THEN
        CREATE POLICY "Users can insert ai_logs for own campaigns"
            ON public.ai_logs FOR INSERT
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.campaigns
                    WHERE campaigns.id = ai_logs.campaign_id
                    AND campaigns.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- Create domain_settings table
CREATE TABLE IF NOT EXISTS public.domain_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  sendgrid_domain_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'failed', 'sender_pending')),
  dns_records JSONB NOT NULL,
  sender_email TEXT,
  sender_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for domain_settings
CREATE INDEX IF NOT EXISTS domain_settings_user_id_idx ON domain_settings(user_id);
CREATE INDEX IF NOT EXISTS domain_settings_status_idx ON domain_settings(status);
CREATE INDEX IF NOT EXISTS domain_settings_sender_email_idx ON domain_settings(sender_email);
CREATE UNIQUE INDEX IF NOT EXISTS domain_settings_domain_idx ON domain_settings(domain);

-- Enable RLS for domain_settings
ALTER TABLE public.domain_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for domain_settings
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'domain_settings' 
        AND policyname = 'Users can view their own domain settings'
    ) THEN
        CREATE POLICY "Users can view their own domain settings"
            ON public.domain_settings FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'domain_settings' 
        AND policyname = 'Users can insert their own domain settings'
    ) THEN
        CREATE POLICY "Users can insert their own domain settings"
            ON public.domain_settings FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_policies 
        WHERE tablename = 'domain_settings' 
        AND policyname = 'Users can update their own domain settings'
    ) THEN
        CREATE POLICY "Users can update their own domain settings"
            ON public.domain_settings FOR UPDATE
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- Add updated_at trigger for domain_settings
DROP TRIGGER IF EXISTS update_domain_settings_updated_at ON public.domain_settings;
CREATE TRIGGER update_domain_settings_updated_at
    BEFORE UPDATE ON public.domain_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

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

DROP TRIGGER IF EXISTS update_emails_updated_at ON public.emails;
CREATE TRIGGER update_emails_updated_at
    BEFORE UPDATE ON public.emails
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