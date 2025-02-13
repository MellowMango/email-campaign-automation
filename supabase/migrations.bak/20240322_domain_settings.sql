-- Create domain_settings table
CREATE TABLE IF NOT EXISTS domain_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  sendgrid_domain_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'failed')),
  dns_records JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX domain_settings_user_id_idx ON domain_settings(user_id);
CREATE INDEX domain_settings_status_idx ON domain_settings(status);
CREATE UNIQUE INDEX domain_settings_domain_idx ON domain_settings(domain);

-- Add RLS policies
ALTER TABLE domain_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own domain settings"
  ON domain_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own domain settings"
  ON domain_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own domain settings"
  ON domain_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER set_domain_settings_updated_at
  BEFORE UPDATE ON domain_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column(); 