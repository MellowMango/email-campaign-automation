-- Create usage_records table
CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    subscription_id UUID REFERENCES subscriptions(id),
    type TEXT NOT NULL CHECK (type IN ('email', 'contact', 'campaign')),
    quantity INTEGER NOT NULL DEFAULT 1,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    billing_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    billing_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create usage_billing table for storing calculated billing amounts
CREATE TABLE IF NOT EXISTS usage_billing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id),
    billing_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    billing_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('email', 'contact', 'campaign')),
    quantity INTEGER NOT NULL,
    base_included INTEGER NOT NULL,
    overage INTEGER NOT NULL,
    rate_per_unit NUMERIC(10, 4) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'billed', 'failed')),
    stripe_invoice_item_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes for better query performance
CREATE INDEX idx_usage_records_user_period ON usage_records(user_id, billing_period_start, billing_period_end);
CREATE INDEX idx_usage_records_subscription ON usage_records(subscription_id);
CREATE INDEX idx_usage_records_type ON usage_records(type);
CREATE INDEX idx_usage_billing_user_period ON usage_billing(user_id, billing_period_start, billing_period_end);
CREATE INDEX idx_usage_billing_subscription ON usage_billing(subscription_id);
CREATE INDEX idx_usage_billing_status ON usage_billing(status);

-- Add RLS policies
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_billing ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage records
CREATE POLICY "Users can view their own usage records"
    ON usage_records FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can view their own usage billing
CREATE POLICY "Users can view their own usage billing"
    ON usage_billing FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role has full access to usage records"
    ON usage_records FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to usage billing"
    ON usage_billing FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create function to record email usage
CREATE OR REPLACE FUNCTION record_email_usage()
RETURNS TRIGGER AS $$
DECLARE
    v_subscription_id UUID;
    v_period_start TIMESTAMP WITH TIME ZONE;
    v_period_end TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get subscription and billing period
    SELECT id, current_period_start, current_period_end
    INTO v_subscription_id, v_period_start, v_period_end
    FROM subscriptions
    WHERE user_id = NEW.user_id
    AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Record usage
    INSERT INTO usage_records (
        user_id,
        subscription_id,
        type,
        quantity,
        billing_period_start,
        billing_period_end
    ) VALUES (
        NEW.user_id,
        v_subscription_id,
        'email',
        1,
        COALESCE(v_period_start, date_trunc('month', NOW())),
        COALESCE(v_period_end, date_trunc('month', NOW()) + INTERVAL '1 month')
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to record contact usage
CREATE OR REPLACE FUNCTION record_contact_usage()
RETURNS TRIGGER AS $$
DECLARE
    v_subscription_id UUID;
    v_period_start TIMESTAMP WITH TIME ZONE;
    v_period_end TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get subscription and billing period
    SELECT id, current_period_start, current_period_end
    INTO v_subscription_id, v_period_start, v_period_end
    FROM subscriptions
    WHERE user_id = NEW.user_id
    AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Record usage
    INSERT INTO usage_records (
        user_id,
        subscription_id,
        type,
        quantity,
        billing_period_start,
        billing_period_end
    ) VALUES (
        NEW.user_id,
        v_subscription_id,
        'contact',
        1,
        COALESCE(v_period_start, date_trunc('month', NOW())),
        COALESCE(v_period_end, date_trunc('month', NOW()) + INTERVAL '1 month')
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to record campaign usage
CREATE OR REPLACE FUNCTION record_campaign_usage()
RETURNS TRIGGER AS $$
DECLARE
    v_subscription_id UUID;
    v_period_start TIMESTAMP WITH TIME ZONE;
    v_period_end TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get subscription and billing period
    SELECT id, current_period_start, current_period_end
    INTO v_subscription_id, v_period_start, v_period_end
    FROM subscriptions
    WHERE user_id = NEW.user_id
    AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Record usage
    INSERT INTO usage_records (
        user_id,
        subscription_id,
        type,
        quantity,
        billing_period_start,
        billing_period_end
    ) VALUES (
        NEW.user_id,
        v_subscription_id,
        'campaign',
        1,
        COALESCE(v_period_start, date_trunc('month', NOW())),
        COALESCE(v_period_end, date_trunc('month', NOW()) + INTERVAL '1 month')
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for usage tracking
CREATE TRIGGER track_email_usage
    AFTER INSERT ON emails
    FOR EACH ROW
    EXECUTE FUNCTION record_email_usage();

CREATE TRIGGER track_contact_usage
    AFTER INSERT ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION record_contact_usage();

CREATE TRIGGER track_campaign_usage
    AFTER INSERT ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION record_campaign_usage();

-- Create function to calculate usage billing
CREATE OR REPLACE FUNCTION calculate_usage_billing(
    p_user_id UUID,
    p_subscription_id UUID,
    p_period_start TIMESTAMP WITH TIME ZONE,
    p_period_end TIMESTAMP WITH TIME ZONE
)
RETURNS void AS $$
DECLARE
    v_plan_limits JSONB;
    v_email_usage INTEGER;
    v_contact_usage INTEGER;
    v_campaign_usage INTEGER;
BEGIN
    -- Get plan limits
    SELECT limits INTO v_plan_limits
    FROM subscriptions s
    JOIN pricing_plans p ON s.plan_id = p.id
    WHERE s.id = p_subscription_id;

    -- Calculate email usage and billing
    SELECT COUNT(*) INTO v_email_usage
    FROM usage_records
    WHERE user_id = p_user_id
    AND type = 'email'
    AND billing_period_start = p_period_start
    AND billing_period_end = p_period_end;

    IF v_email_usage > (v_plan_limits->>'included_emails')::INTEGER THEN
        INSERT INTO usage_billing (
            user_id,
            subscription_id,
            billing_period_start,
            billing_period_end,
            type,
            quantity,
            base_included,
            overage,
            rate_per_unit,
            amount
        ) VALUES (
            p_user_id,
            p_subscription_id,
            p_period_start,
            p_period_end,
            'email',
            v_email_usage,
            (v_plan_limits->>'included_emails')::INTEGER,
            v_email_usage - (v_plan_limits->>'included_emails')::INTEGER,
            (v_plan_limits->>'additional_email_cost')::NUMERIC,
            (v_email_usage - (v_plan_limits->>'included_emails')::INTEGER) * (v_plan_limits->>'additional_email_cost')::NUMERIC
        );
    END IF;

    -- Calculate contact usage and billing
    SELECT COUNT(*) INTO v_contact_usage
    FROM usage_records
    WHERE user_id = p_user_id
    AND type = 'contact'
    AND billing_period_start = p_period_start
    AND billing_period_end = p_period_end;

    IF v_contact_usage > (v_plan_limits->>'included_contacts')::INTEGER THEN
        INSERT INTO usage_billing (
            user_id,
            subscription_id,
            billing_period_start,
            billing_period_end,
            type,
            quantity,
            base_included,
            overage,
            rate_per_unit,
            amount
        ) VALUES (
            p_user_id,
            p_subscription_id,
            p_period_start,
            p_period_end,
            'contact',
            v_contact_usage,
            (v_plan_limits->>'included_contacts')::INTEGER,
            v_contact_usage - (v_plan_limits->>'included_contacts')::INTEGER,
            (v_plan_limits->>'additional_contact_cost')::NUMERIC,
            (v_contact_usage - (v_plan_limits->>'included_contacts')::INTEGER) * (v_plan_limits->>'additional_contact_cost')::NUMERIC
        );
    END IF;

    -- Calculate campaign usage and billing
    SELECT COUNT(*) INTO v_campaign_usage
    FROM usage_records
    WHERE user_id = p_user_id
    AND type = 'campaign'
    AND billing_period_start = p_period_start
    AND billing_period_end = p_period_end;

    IF v_campaign_usage > (v_plan_limits->>'included_campaigns')::INTEGER THEN
        INSERT INTO usage_billing (
            user_id,
            subscription_id,
            billing_period_start,
            billing_period_end,
            type,
            quantity,
            base_included,
            overage,
            rate_per_unit,
            amount
        ) VALUES (
            p_user_id,
            p_subscription_id,
            p_period_start,
            p_period_end,
            'campaign',
            v_campaign_usage,
            (v_plan_limits->>'included_campaigns')::INTEGER,
            v_campaign_usage - (v_plan_limits->>'included_campaigns')::INTEGER,
            (v_plan_limits->>'additional_campaign_cost')::NUMERIC,
            (v_campaign_usage - (v_plan_limits->>'included_campaigns')::INTEGER) * (v_plan_limits->>'additional_campaign_cost')::NUMERIC
        );
    END IF;
END;
$$ LANGUAGE plpgsql; 