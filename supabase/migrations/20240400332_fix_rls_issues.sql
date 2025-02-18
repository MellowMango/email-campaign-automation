-- Enable RLS on email_events table
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for email_events
CREATE POLICY "Users can view their own email events"
    ON email_events FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to email events"
    ON email_events FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Enable RLS on data migration backup table
ALTER TABLE data_migration_backup_20240327 ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for data migration backup (only service role should access this)
CREATE POLICY "Service role has full access to data migration backup"
    ON data_migration_backup_20240327 FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Add helpful indexes for email_events if they don't exist
CREATE INDEX IF NOT EXISTS idx_email_events_user_id ON email_events(user_id);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_id ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_email_id ON email_events(email_id);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type); 