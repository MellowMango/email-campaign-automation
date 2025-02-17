-- Create pricing_plans table
CREATE TABLE IF NOT EXISTS pricing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    stripe_price_id TEXT NOT NULL,
    features JSONB NOT NULL,
    limits JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(stripe_price_id)
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    plan_id UUID NOT NULL REFERENCES pricing_plans(id),
    stripe_subscription_id TEXT NOT NULL,
    stripe_customer_id TEXT NOT NULL,
    status TEXT NOT NULL,
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id),
    UNIQUE(stripe_subscription_id)
);

-- Create payment_methods table
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    stripe_payment_method_id TEXT NOT NULL,
    type TEXT NOT NULL,
    last_four TEXT NOT NULL,
    expiry_month INTEGER,
    expiry_year INTEGER,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(stripe_payment_method_id)
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id),
    stripe_invoice_id TEXT NOT NULL,
    amount_due INTEGER NOT NULL,
    amount_paid INTEGER NOT NULL,
    status TEXT NOT NULL,
    billing_reason TEXT NOT NULL,
    invoice_pdf TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(stripe_invoice_id)
);

-- Add RLS policies
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Pricing plans are readable by all authenticated users
CREATE POLICY "Pricing plans are readable by all authenticated users"
    ON pricing_plans FOR SELECT
    TO authenticated
    USING (true);

-- Users can read their own subscriptions
CREATE POLICY "Users can read their own subscriptions"
    ON subscriptions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can read their own payment methods
CREATE POLICY "Users can read their own payment methods"
    ON payment_methods FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can read their own invoices
CREATE POLICY "Users can read their own invoices"
    ON invoices FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role has full access to all tables
CREATE POLICY "Service role has full access to pricing plans"
    ON pricing_plans FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to subscriptions"
    ON subscriptions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to payment methods"
    ON payment_methods FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to invoices"
    ON invoices FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON invoices(subscription_id);

-- Insert default pricing plans
INSERT INTO pricing_plans (name, description, stripe_price_id, features, limits, sort_order) VALUES
(
    'Base Plan',
    'Perfect for growing businesses with usage-based pricing',
    'price_base_monthly',
    '{
        "adaptive_sequences": false,
        "auto_responder": false,
        "lead_scoring": false
    }'::jsonb,
    '{
        "included_emails": 5000,
        "included_contacts": 2500,
        "included_campaigns": 5,
        "additional_email_cost": 0.002,
        "additional_contact_cost": 0.01,
        "additional_campaign_cost": 10.00
    }'::jsonb,
    0
);

-- Insert default pricing plans
INSERT INTO pricing_plans (name, description, stripe_price_id, features, limits, sort_order) VALUES
(
    'Pro',
    'For growing businesses',
    'price_pro_monthly',
    '{
        "adaptive_sequences": true,
        "auto_responder": true,
        "lead_scoring": false
    }'::jsonb,
    '{
        "daily_email_limit": 1000,
        "contacts_limit": 10000,
        "campaigns_limit": 10
    }'::jsonb,
    1
),
(
    'Enterprise',
    'For large organizations',
    'price_enterprise_monthly',
    '{
        "adaptive_sequences": true,
        "auto_responder": true,
        "lead_scoring": true
    }'::jsonb,
    '{
        "daily_email_limit": 5000,
        "contacts_limit": 50000,
        "campaigns_limit": null
    }'::jsonb,
    2
); 