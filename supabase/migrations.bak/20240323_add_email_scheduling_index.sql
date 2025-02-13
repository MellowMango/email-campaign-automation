-- Add index for scheduled emails query
CREATE INDEX IF NOT EXISTS idx_emails_scheduled
ON public.emails (status, scheduled_at)
WHERE status = 'pending';

-- Add index for campaign contacts
CREATE INDEX IF NOT EXISTS idx_contacts_campaign
ON public.contacts (campaign_id); 