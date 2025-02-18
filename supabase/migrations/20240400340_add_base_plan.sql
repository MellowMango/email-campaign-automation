-- Add base plan with debugging
DO $$
DECLARE
    v_plan_exists BOOLEAN;
    v_plan RECORD;
BEGIN
    -- Check if plan exists before insert
    SELECT EXISTS (
        SELECT 1 FROM pricing_plans WHERE id = '11111111-1111-4000-a000-000000000000'
    ) INTO v_plan_exists;

    RAISE NOTICE 'Plan exists before insert: %', v_plan_exists;

    -- Add base plan
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
        '11111111-1111-4000-a000-000000000000',
        'Base Plan',
        'Perfect for growing businesses',
        'price_1QtyUlDbNpQD7yy9EYDdwvnn',
        jsonb_build_object(
            'adaptive_sequences', true,
            'auto_responder', true,
            'lead_scoring', true
        ),
        jsonb_build_object(
            'included_emails', 5000,
            'included_contacts', 2500,
            'included_campaigns', 5,
            'additional_email_cost', 0.002,
            'additional_contact_cost', 0.01,
            'additional_campaign_cost', 10
        ),
        true,
        1,
        false
    ) ON CONFLICT (id) DO UPDATE SET
        limits = EXCLUDED.limits,
        features = EXCLUDED.features,
        stripe_price_id = EXCLUDED.stripe_price_id,
        is_active = true;

    -- Verify insert
    SELECT EXISTS (
        SELECT 1 FROM pricing_plans WHERE id = '11111111-1111-4000-a000-000000000000'
    ) INTO v_plan_exists;

    RAISE NOTICE 'Plan exists after insert: %', v_plan_exists;

    -- Log all active plans
    RAISE NOTICE 'Active plans:';
    FOR v_plan IN (
        SELECT id, name, stripe_price_id, is_active, is_admin 
        FROM pricing_plans 
        WHERE is_active = true
    ) LOOP
        RAISE NOTICE 'Plan: % (ID: %, Price: %, Active: %, Admin: %)', 
            v_plan.name, v_plan.id, v_plan.stripe_price_id, v_plan.is_active, v_plan.is_admin;
    END LOOP;
END $$;

-- Function to verify pricing setup
CREATE OR REPLACE FUNCTION verify_pricing_setup()
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    details TEXT
) AS $$
BEGIN
    -- Check base plan
    RETURN QUERY
    SELECT 
        'Base Plan Check',
        CASE WHEN EXISTS (SELECT 1 FROM pricing_plans WHERE is_admin = false AND is_active = true)
            THEN 'OK' ELSE 'FAILED' END,
        CASE WHEN EXISTS (SELECT 1 FROM pricing_plans WHERE is_admin = false AND is_active = true)
            THEN 'Base plan exists'
            ELSE 'Base plan not found' END;

    -- Check Stripe price ID format
    RETURN QUERY
    SELECT 
        'Stripe Price ID Check',
        CASE WHEN EXISTS (SELECT 1 FROM pricing_plans WHERE stripe_price_id LIKE 'price_%')
            THEN 'OK' ELSE 'WARNING' END,
        CASE WHEN EXISTS (SELECT 1 FROM pricing_plans WHERE stripe_price_id LIKE 'price_%')
            THEN 'Stripe price IDs look valid'
            ELSE 'Stripe price IDs may need to be updated' END;
END;
$$ LANGUAGE plpgsql;

-- Add policy for public access to pricing plans
CREATE POLICY "Public can view active pricing plans"
    ON pricing_plans FOR SELECT
    TO anon
    USING (is_active = true AND is_admin = false);

-- Run verification
SELECT * FROM verify_pricing_setup(); 