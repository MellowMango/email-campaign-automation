-- Function to check user status
CREATE OR REPLACE FUNCTION check_user_status(p_user_id UUID)
RETURNS TABLE (
    status TEXT,
    details JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_subscription RECORD;
    v_result JSONB;
BEGIN
    -- Get the user's subscription
    SELECT s.*, p.name as plan_name, p.is_admin
    INTO v_subscription
    FROM subscriptions s
    LEFT JOIN pricing_plans p ON s.plan_id = p.id
    WHERE s.user_id = p_user_id
    AND s.status = 'active'
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- Build the result JSON
    v_result = jsonb_build_object(
        'user_id', p_user_id,
        'subscription_id', v_subscription.id,
        'plan_name', v_subscription.plan_name,
        'subscription_status', v_subscription.status,
        'is_admin', v_subscription.is_admin,
        'current_period_end', v_subscription.current_period_end
    );

    -- Determine status
    IF v_subscription.is_admin THEN
        RETURN QUERY SELECT 'admin'::TEXT, v_result;
    ELSIF v_subscription.status = 'active' THEN
        RETURN QUERY SELECT 'paying'::TEXT, v_result;
    ELSE
        RETURN QUERY SELECT 'guest'::TEXT, v_result;
    END IF;
END;
$$;

-- Function to make a user an admin
CREATE OR REPLACE FUNCTION make_user_admin(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_admin_plan_id UUID := '00000000-0000-4000-a000-000000000000';
    v_result JSONB;
BEGIN
    -- Verify user exists
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    -- Get or create admin subscription
    WITH subscription_update AS (
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
        )
        ON CONFLICT (user_id) WHERE is_admin = true
        DO UPDATE SET
            current_period_end = NOW() + INTERVAL '100 years',
            status = 'active'
        RETURNING *
    )
    SELECT jsonb_build_object(
        'status', 'success',
        'user_id', p_user_id,
        'subscription_id', s.id,
        'is_admin', true,
        'message', 'User successfully made admin'
    )
    INTO v_result
    FROM subscription_update s;

    RETURN v_result;
END;
$$;

-- Example usage:
COMMENT ON FUNCTION check_user_status IS 'Check if a user is admin, paying, or guest. Example:
SELECT * FROM check_user_status(''user-uuid-here'');';

COMMENT ON FUNCTION make_user_admin IS 'Make a user an admin. Example:
SELECT make_user_admin(''user-uuid-here'');';

-- Create view for easy user status checking
CREATE OR REPLACE VIEW user_status_summary AS
SELECT 
    u.id as user_id,
    u.email,
    COALESCE(s.status, 'guest') as subscription_status,
    CASE 
        WHEN s.is_admin THEN 'admin'
        WHEN s.status = 'active' THEN 'paying'
        ELSE 'guest'
    END as user_type,
    p.name as plan_name,
    s.current_period_end as subscription_end,
    s.created_at as subscription_created
FROM auth.users u
LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
LEFT JOIN pricing_plans p ON s.plan_id = p.id
ORDER BY u.email; 