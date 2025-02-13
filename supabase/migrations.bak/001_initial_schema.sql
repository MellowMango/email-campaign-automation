-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Profiles
CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Campaigns Table
CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Emails Table for Outreach Scheduling & Tracking
CREATE TABLE emails (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  subject TEXT,
  content TEXT,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Analytics Table for Real-Time Metrics
CREATE TABLE analytics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- AI Logs Table for Copy Generation Tracking
CREATE TABLE ai_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  prompt TEXT,
  response TEXT,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- Optional: Audience Segmentation for Campaign Personalization
CREATE TABLE audiences (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  segment_name TEXT,
  demographics JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Set up Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audiences ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can view own campaigns"
  ON campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own campaigns"
  ON campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own campaigns"
  ON campaigns FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view emails from own campaigns"
  ON emails FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = emails.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage emails from own campaigns"
  ON emails FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = emails.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view analytics from own campaigns"
  ON analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = analytics.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view AI logs from own campaigns"
  ON ai_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = ai_logs.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage audiences from own campaigns"
  ON audiences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = audiences.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Create trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user(); 