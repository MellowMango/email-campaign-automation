-- Create email_events table
CREATE TABLE IF NOT EXISTS email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES emails(id),
    campaign_id UUID REFERENCES campaigns(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT valid_event_type CHECK (
        event_type IN (
            'processed', 'dropped', 'delivered', 'deferred',
            'bounce', 'blocked', 'spam_report', 'unsubscribe',
            'group_unsubscribe', 'group_resubscribe', 'open', 'click'
        )
    )
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_email_events_email_id ON email_events(email_id);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_id ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_user_id ON email_events(user_id);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_occurred_at ON email_events(occurred_at);

-- Add new columns to emails table for tracking
ALTER TABLE emails ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS opened BOOLEAN DEFAULT FALSE;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS opens_count INTEGER DEFAULT 0;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS clicked BOOLEAN DEFAULT FALSE;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS clicks_count INTEGER DEFAULT 0;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMP WITH TIME ZONE;

-- Add new columns to campaigns table for analytics
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS analytics JSONB DEFAULT jsonb_build_object(
    'sent_count', 0,
    'delivered_count', 0,
    'opened_count', 0,
    'unique_opens', 0,
    'clicked_count', 0,
    'unique_clicks', 0,
    'unsubscribed_count', 0,
    'bounced_count', 0,
    'spam_reports', 0
);

-- Create function to update campaign analytics
CREATE OR REPLACE FUNCTION update_campaign_analytics(
    p_campaign_id UUID,
    p_event_type TEXT
) RETURNS void AS $$
DECLARE
    v_analytics JSONB;
BEGIN
    -- Get current analytics
    SELECT analytics INTO v_analytics
    FROM campaigns
    WHERE id = p_campaign_id;

    -- Update analytics based on event type
    CASE p_event_type
        WHEN 'open' THEN
            v_analytics = jsonb_set(v_analytics, '{opened_count}', 
                (COALESCE((v_analytics->>'opened_count')::int, 0) + 1)::text::jsonb);
            -- Update unique opens in a separate query
            UPDATE campaigns
            SET analytics = jsonb_set(analytics, '{unique_opens}',
                (SELECT COUNT(DISTINCT email_id)::text::jsonb
                 FROM email_events
                 WHERE campaign_id = p_campaign_id AND event_type = 'open'))
            WHERE id = p_campaign_id;
        WHEN 'click' THEN
            v_analytics = jsonb_set(v_analytics, '{clicked_count}',
                (COALESCE((v_analytics->>'clicked_count')::int, 0) + 1)::text::jsonb);
            -- Update unique clicks in a separate query
            UPDATE campaigns
            SET analytics = jsonb_set(analytics, '{unique_clicks}',
                (SELECT COUNT(DISTINCT email_id)::text::jsonb
                 FROM email_events
                 WHERE campaign_id = p_campaign_id AND event_type = 'click'))
            WHERE id = p_campaign_id;
        WHEN 'unsubscribe' THEN
            v_analytics = jsonb_set(v_analytics, '{unsubscribed_count}',
                (COALESCE((v_analytics->>'unsubscribed_count')::int, 0) + 1)::text::jsonb);
        WHEN 'bounce' THEN
            v_analytics = jsonb_set(v_analytics, '{bounced_count}',
                (COALESCE((v_analytics->>'bounced_count')::int, 0) + 1)::text::jsonb);
        WHEN 'spam_report' THEN
            v_analytics = jsonb_set(v_analytics, '{spam_reports}',
                (COALESCE((v_analytics->>'spam_reports')::int, 0) + 1)::text::jsonb);
        WHEN 'delivered' THEN
            v_analytics = jsonb_set(v_analytics, '{delivered_count}',
                (COALESCE((v_analytics->>'delivered_count')::int, 0) + 1)::text::jsonb);
    END CASE;

    -- Update campaign analytics
    UPDATE campaigns
    SET analytics = v_analytics
    WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql; 