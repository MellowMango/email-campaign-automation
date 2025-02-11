-- Add new columns to campaigns table
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS goals TEXT,
ADD COLUMN IF NOT EXISTS value_proposition TEXT,
ADD COLUMN IF NOT EXISTS email_tone TEXT CHECK (email_tone IN ('formal', 'casual', 'professional', 'friendly')),
ADD COLUMN IF NOT EXISTS campaign_type TEXT CHECK (campaign_type IN ('manual', 'ai-adaptive')) DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS emails_per_week INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{"adaptive_sequences": false, "auto_responder": false, "lead_scoring": false}'::JSONB;

-- Update existing rows to have default values
UPDATE public.campaigns
SET 
    campaign_type = 'manual',
    duration = 30,
    emails_per_week = 2,
    features = '{"adaptive_sequences": false, "auto_responder": false, "lead_scoring": false}'::JSONB
WHERE campaign_type IS NULL; 