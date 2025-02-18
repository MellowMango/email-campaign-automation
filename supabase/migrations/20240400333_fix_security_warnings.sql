-- Move pg_net extension to extensions schema
DROP EXTENSION IF EXISTS pg_net;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- Drop existing functions first
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.get_setting(text) CASCADE;
DROP FUNCTION IF EXISTS public.invoke_billing_calculation() CASCADE;
DROP FUNCTION IF EXISTS public.update_campaign_analytics(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.record_email_usage() CASCADE;
DROP FUNCTION IF EXISTS public.record_contact_usage() CASCADE;
DROP FUNCTION IF EXISTS public.record_campaign_usage() CASCADE;
DROP FUNCTION IF EXISTS public.calculate_usage_billing(UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.update_contact_engagement_score() CASCADE;

-- Fix function search paths
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at, updated_at)
  VALUES (new.id, new.email, now(), now());
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_setting(p_key text)
RETURNS text
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
    v_value text;
BEGIN
    SELECT value INTO v_value
    FROM app_settings
    WHERE key = p_key;
    RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_billing_calculation()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM calculate_daily_billing();
END;
$$;

CREATE OR REPLACE FUNCTION public.update_campaign_analytics(
    p_campaign_id UUID,
    p_event_type TEXT
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
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
        WHEN 'click' THEN
            v_analytics = jsonb_set(v_analytics, '{clicked_count}',
                (COALESCE((v_analytics->>'clicked_count')::int, 0) + 1)::text::jsonb);
        WHEN 'unsubscribe' THEN
            v_analytics = jsonb_set(v_analytics, '{unsubscribed_count}',
                (COALESCE((v_analytics->>'unsubscribed_count')::int, 0) + 1)::text::jsonb);
        ELSE
            NULL;
    END CASE;

    -- Update campaign
    UPDATE campaigns
    SET analytics = v_analytics
    WHERE id = p_campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_email_usage()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
    v_subscription_id UUID;
    v_period_start TIMESTAMP WITH TIME ZONE;
    v_period_end TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT id, current_period_start, current_period_end
    INTO v_subscription_id, v_period_start, v_period_end
    FROM subscriptions
    WHERE user_id = NEW.user_id
    AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

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
$$;

CREATE OR REPLACE FUNCTION public.record_contact_usage()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
    v_subscription_id UUID;
    v_period_start TIMESTAMP WITH TIME ZONE;
    v_period_end TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT id, current_period_start, current_period_end
    INTO v_subscription_id, v_period_start, v_period_end
    FROM subscriptions
    WHERE user_id = NEW.user_id
    AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

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
$$;

CREATE OR REPLACE FUNCTION public.record_campaign_usage()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
    v_subscription_id UUID;
    v_period_start TIMESTAMP WITH TIME ZONE;
    v_period_end TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT id, current_period_start, current_period_end
    INTO v_subscription_id, v_period_start, v_period_end
    FROM subscriptions
    WHERE user_id = NEW.user_id
    AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

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
$$;

CREATE OR REPLACE FUNCTION public.calculate_usage_billing(
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
BEGIN
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

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_contact_engagement_score()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
    -- Update engagement score logic here
    RETURN NEW;
END;
$$;

-- Recreate any necessary triggers
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER handle_updated_at
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_updated_at_column
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER track_email_usage
    AFTER INSERT ON emails
    FOR EACH ROW EXECUTE FUNCTION record_email_usage();

CREATE TRIGGER track_contact_usage
    AFTER INSERT ON contacts
    FOR EACH ROW EXECUTE FUNCTION record_contact_usage();

CREATE TRIGGER track_campaign_usage
    AFTER INSERT ON campaigns
    FOR EACH ROW EXECUTE FUNCTION record_campaign_usage(); 