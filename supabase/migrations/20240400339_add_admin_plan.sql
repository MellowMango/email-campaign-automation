-- Add is_admin column to pricing_plans if it doesn't exist
ALTER TABLE pricing_plans ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Add admin plan
DO $$
DECLARE
    v_admin_plan_id UUID := '00000000-0000-4000-a000-000000000000';
    v_plan_exists BOOLEAN;
BEGIN
    -- Check if admin plan exists
    SELECT EXISTS (
        SELECT 1 FROM pricing_plans WHERE id = v_admin_plan_id
    ) INTO v_plan_exists;

    RAISE NOTICE 'Admin plan exists: %', v_plan_exists;

    -- Insert or update admin plan
    INSERT INTO pricing_plans (
        id,
        name,
        description,
        stripe_price_id,
        features,
        limits,
        is_active,
        sort_order,
        is_admin
    ) VALUES (
        v_admin_plan_id,
        'Admin Plan',
        'Special plan for admin accounts with unlimited usage',
        'price_admin_unlimited',
        jsonb_build_object(
            'adaptive_sequences', true,
            'auto_responder', true,
            'lead_scoring', true
        ),
        jsonb_build_object(
            'included_emails', 999999999,
            'included_contacts', 999999999,
            'included_campaigns', 999999999,
            'additional_email_cost', 0,
            'additional_contact_cost', 0,
            'additional_campaign_cost', 0
        ),
        true,
        0,
        true
    ) ON CONFLICT (id) DO UPDATE SET
        limits = EXCLUDED.limits,
        features = EXCLUDED.features,
        is_admin = true;

    RAISE NOTICE 'Admin plan created/updated successfully';
END $$;

-- Add is_admin column to subscriptions if it doesn't exist
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create function to handle admin subscription creation
CREATE OR REPLACE FUNCTION create_admin_subscription(p_user_id UUID)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
    v_admin_plan_id UUID;
    v_existing_sub UUID;
    v_user_exists BOOLEAN;
BEGIN
    -- Check if user exists
    SELECT EXISTS (
        SELECT 1 FROM auth.users WHERE id = p_user_id
    ) INTO v_user_exists;

    IF NOT v_user_exists THEN
        RAISE EXCEPTION 'User with ID % does not exist', p_user_id;
    END IF;

    -- Get admin plan ID
    SELECT id INTO v_admin_plan_id
    FROM pricing_plans
    WHERE is_admin = true
    LIMIT 1;

    IF v_admin_plan_id IS NULL THEN
        RAISE EXCEPTION 'Admin plan not found';
    END IF;

    RAISE NOTICE 'Found admin plan with ID: %', v_admin_plan_id;

    -- Check if user already has a subscription
    SELECT id INTO v_existing_sub
    FROM subscriptions
    WHERE user_id = p_user_id;

    IF v_existing_sub IS NULL THEN
        -- Create new admin subscription
        INSERT INTO subscriptions (
            user_id,
            plan_id,
            stripe_subscription_id,
            stripe_customer_id,
            status,
            current_period_start,
            current_period_end,
            is_admin
        ) VALUES (
            p_user_id,
            v_admin_plan_id,
            'admin_sub_' || p_user_id,
            'admin_cus_' || p_user_id,
            'active',
            NOW(),
            NOW() + INTERVAL '100 years',
            true
        );
        
        RAISE NOTICE 'Created new admin subscription for user %', p_user_id;
    ELSE
        -- Update existing subscription to admin
        UPDATE subscriptions
        SET plan_id = v_admin_plan_id,
            is_admin = true,
            status = 'active',
            current_period_end = NOW() + INTERVAL '100 years'
        WHERE id = v_existing_sub;
        
        RAISE NOTICE 'Updated existing subscription % to admin for user %', v_existing_sub, p_user_id;
    END IF;
END;
$$;

-- Function to verify admin setup
CREATE OR REPLACE FUNCTION verify_admin_setup()
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    details TEXT
) AS $$
BEGIN
    -- Check admin plan
    RETURN QUERY
    SELECT 
        'Admin Plan Check',
        CASE WHEN EXISTS (SELECT 1 FROM pricing_plans WHERE is_admin = true)
            THEN 'OK' ELSE 'FAILED' END,
        CASE WHEN EXISTS (SELECT 1 FROM pricing_plans WHERE is_admin = true)
            THEN 'Admin plan exists'
            ELSE 'Admin plan not found' END;

    -- Check admin subscriptions
    RETURN QUERY
    SELECT 
        'Admin Subscriptions Check',
        CASE WHEN EXISTS (SELECT 1 FROM subscriptions WHERE is_admin = true)
            THEN 'OK' ELSE 'NO ADMINS' END,
        CASE WHEN EXISTS (SELECT 1 FROM subscriptions WHERE is_admin = true)
            THEN (SELECT COUNT(*)::TEXT || ' admin subscriptions found' FROM subscriptions WHERE is_admin = true)
            ELSE 'No admin subscriptions found' END;
END;
$$ LANGUAGE plpgsql;

-- Update calculate_usage_billing function to handle admin subscriptions
CREATE OR REPLACE FUNCTION calculate_usage_billing(
    p_user_id UUID,
    p_subscription_id UUID,
    p_period_start TIMESTAMP WITH TIME ZONE,
    p_period_end TIMESTAMP WITH TIME ZONE
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
    v_plan_limits JSONB;
    v_email_usage INTEGER;
    v_contact_usage INTEGER;
    v_campaign_usage INTEGER;
    v_is_admin BOOLEAN;
BEGIN
    -- Check if admin subscription
    SELECT is_admin INTO v_is_admin
    FROM subscriptions
    WHERE id = p_subscription_id;

    -- Skip billing calculation for admin subscriptions
    IF v_is_admin THEN
        RETURN;
    END IF;

    -- Original billing calculation logic
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
END;
$$;

-- Create admin subscriptions for existing admin users (you'll need to provide the admin user IDs)
-- Example:
-- SELECT create_admin_subscription('admin-user-id-1');
-- SELECT create_admin_subscription('admin-user-id-2'); 