-- Add CTA links to campaigns table
ALTER TABLE public.campaigns
ADD COLUMN cta_links JSONB DEFAULT '{
  "awareness": "",
  "conversion": "",
  "nurture": ""
}'::JSONB;

-- Add constraint to ensure CTA links structure
ALTER TABLE public.campaigns
ADD CONSTRAINT check_cta_links
CHECK (
  cta_links ? 'awareness' AND
  cta_links ? 'conversion' AND
  cta_links ? 'nurture'
);

-- Update existing campaigns with default CTA links
UPDATE public.campaigns
SET cta_links = '{
  "awareness": "",
  "conversion": "",
  "nurture": ""
}'::JSONB
WHERE cta_links IS NULL; 