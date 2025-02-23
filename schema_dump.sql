

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."http_response" AS (
	"status" integer,
	"content" "text",
	"headers" "jsonb"
);


ALTER TYPE "public"."http_response" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_usage_billing"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."calculate_usage_billing"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clean_old_generation_status"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Delete generation status older than 24 hours
    DELETE FROM public.generation_status
    WHERE updated_at < NOW() - INTERVAL '24 hours';
END;
$$;


ALTER FUNCTION "public"."clean_old_generation_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contacts_search_vector_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.email, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.first_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.last_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.company, '')), 'C');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."contacts_search_vector_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_admin_subscription"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."create_admin_subscription"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pending_emails"("batch_size" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "campaign_id" "uuid", "subject" "text", "content" "text", "scheduled_at" timestamp with time zone, "campaign_name" "text", "user_id" "uuid", "user_email" "text", "user_name" "text", "to_email" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT 
        e.id,
        e.campaign_id,
        e.subject,
        e.content,
        e.scheduled_at,
        c.name as campaign_name,
        p.id as user_id,
        p.email as user_email,
        p.full_name as user_name,
        e.to_email
    FROM emails e
    INNER JOIN campaigns c ON c.id = e.campaign_id
    INNER JOIN profiles p ON p.id = c.user_id
    WHERE e.status = 'pending'
    AND e.scheduled_at <= NOW()
    AND e.to_email IS NOT NULL
    AND e.to_email != ''  -- Only get emails that have recipients
    ORDER BY e.scheduled_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED;
$$;


ALTER FUNCTION "public"."get_pending_emails"("batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_setting"("p_key" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_value text;
BEGIN
    SELECT value INTO v_value
    FROM app_settings
    WHERE key = p_key;
    RETURN v_value;
END;
$$;


ALTER FUNCTION "public"."get_setting"("p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at, updated_at)
  VALUES (new.id, new.email, now(), now());
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoke_billing_calculation"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    PERFORM calculate_daily_billing();
END;
$$;


ALTER FUNCTION "public"."invoke_billing_calculation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_campaign_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."record_campaign_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_contact_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."record_contact_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_email_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."record_email_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_campaign_analytics"("p_campaign_id" "uuid", "p_event_type" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."update_campaign_analytics"("p_campaign_id" "uuid", "p_event_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_contact_engagement_score"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Update engagement score logic here
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_contact_engagement_score"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_admin_setup"() RETURNS TABLE("check_name" "text", "status" "text", "details" "text")
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."verify_admin_setup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_pricing_setup"() RETURNS TABLE("check_name" "text", "status" "text", "details" "text")
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."verify_pricing_setup"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid",
    "email_id" "uuid",
    "prompt" "text" NOT NULL,
    "response" "text" NOT NULL,
    "model" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "target_audience" "text",
    "email_template" "text",
    "personalization_rules" "jsonb",
    "analytics" "jsonb" DEFAULT '{"sent": 0, "opened": 0, "clicked": 0, "replied": 0}'::"jsonb",
    "goals" "text",
    "value_proposition" "text",
    "email_tone" "text",
    "campaign_type" "text" DEFAULT 'manual'::"text",
    "duration" integer DEFAULT 30,
    "emails_per_week" integer DEFAULT 2,
    "features" "jsonb" DEFAULT '{"lead_scoring": false, "auto_responder": false, "adaptive_sequences": false}'::"jsonb",
    "cta_links" "jsonb" DEFAULT '{"nurture": "", "awareness": "", "conversion": ""}'::"jsonb",
    "sequence_type" "text" NOT NULL,
    CONSTRAINT "campaigns_campaign_type_check" CHECK (("campaign_type" = ANY (ARRAY['manual'::"text", 'ai-adaptive'::"text"]))),
    CONSTRAINT "campaigns_email_tone_check" CHECK (("email_tone" = ANY (ARRAY['formal'::"text", 'casual'::"text", 'professional'::"text", 'friendly'::"text"]))),
    CONSTRAINT "campaigns_sequence_type_check" CHECK (("sequence_type" = ANY (ARRAY['awareness'::"text", 'conversion'::"text", 'nurture'::"text"]))),
    CONSTRAINT "campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text"]))),
    CONSTRAINT "check_cta_links" CHECK ((("cta_links" ? 'awareness'::"text") AND ("cta_links" ? 'conversion'::"text") AND ("cta_links" ? 'nurture'::"text")))
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_list_members" (
    "contact_id" "uuid" NOT NULL,
    "list_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"(),
    "score" integer DEFAULT 0,
    "engagement_metrics" "jsonb" DEFAULT '{"opens": 0, "clicks": 0, "replies": 0}'::"jsonb"
);


ALTER TABLE "public"."contact_list_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "type" "text" DEFAULT 'manual'::"text",
    "rules" "jsonb" DEFAULT '{}'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "contact_lists_type_check" CHECK (("type" = ANY (ARRAY['manual'::"text", 'dynamic'::"text", 'segment'::"text"])))
);


ALTER TABLE "public"."contact_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "email" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "company" "text",
    "position" "text",
    "linkedin_url" "text",
    "status" "text" DEFAULT 'new'::"text",
    "last_contacted" timestamp with time zone,
    "notes" "text",
    "custom_fields" "jsonb",
    "engagement_score" integer DEFAULT 0,
    "last_engagement" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "search_vector" "tsvector" GENERATED ALWAYS AS (((("setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("email", ''::"text")), 'A'::"char") || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("first_name", ''::"text")), 'B'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("last_name", ''::"text")), 'B'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("company", ''::"text")), 'C'::"char"))) STORED,
    CONSTRAINT "contacts_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'responded'::"text", 'converted'::"text", 'unsubscribed'::"text"])))
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_migration_backup_20240327" (
    "table_name" "text",
    "record_id" "uuid",
    "data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."data_migration_backup_20240327" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."domain_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "domain" "text" NOT NULL,
    "sendgrid_domain_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "dns_records" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sender_email" "text",
    "sender_verified" boolean DEFAULT false,
    CONSTRAINT "domain_settings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'failed'::"text", 'sender_pending'::"text"])))
);


ALTER TABLE "public"."domain_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email_id" "uuid",
    "campaign_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "error_type" "text" NOT NULL,
    "error_message" "text",
    "error_stack" "text",
    "context" "jsonb",
    "retry_count" integer DEFAULT 0,
    "last_retry_at" timestamp with time zone,
    "next_retry_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_error_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'retrying'::"text", 'resolved'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."email_errors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_data" "jsonb" NOT NULL,
    "occurred_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_event_type" CHECK (("event_type" = ANY (ARRAY['processed'::"text", 'dropped'::"text", 'delivered'::"text", 'deferred'::"text", 'bounce'::"text", 'blocked'::"text", 'spam_report'::"text", 'unsubscribe'::"text", 'group_unsubscribe'::"text", 'group_resubscribe'::"text", 'open'::"text", 'click'::"text"])))
);


ALTER TABLE "public"."email_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid",
    "subject" "text" NOT NULL,
    "content" "text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "to_email" "text",
    "delivered_at" timestamp with time zone,
    "opened" boolean DEFAULT false,
    "opened_at" timestamp with time zone,
    "opens_count" integer DEFAULT 0,
    "clicked" boolean DEFAULT false,
    "clicked_at" timestamp with time zone,
    "clicks_count" integer DEFAULT 0,
    "unsubscribed_at" timestamp with time zone,
    CONSTRAINT "check_pending_has_recipient" CHECK ((("status" <> 'pending'::"text") OR (("to_email" IS NOT NULL) AND ("to_email" <> ''::"text")))),
    CONSTRAINT "check_scheduled_at_future" CHECK ((("status" <> 'pending'::"text") OR ("scheduled_at" > "now"()))),
    CONSTRAINT "check_sequence_type" CHECK ((("metadata" ->> 'sequence_type'::"text") = ANY (ARRAY['awareness'::"text", 'conversion'::"text", 'nurture'::"text"]))),
    CONSTRAINT "emails_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."emails" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retry_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email_id" "uuid",
    "error_id" "uuid" NOT NULL,
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "next_retry_at" timestamp with time zone NOT NULL,
    "last_error" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    CONSTRAINT "valid_retry_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."retry_queue" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."error_monitoring" WITH ("security_invoker"='true') AS
 SELECT "ee"."id" AS "error_id",
    "ee"."email_id",
    "ee"."campaign_id",
    "ee"."user_id",
    "u"."email" AS "user_email",
    "ee"."error_type",
    "ee"."error_message",
    "ee"."retry_count",
    "ee"."status" AS "error_status",
    "ee"."created_at" AS "error_occurred_at",
    "rq"."id" AS "retry_id",
    "rq"."next_retry_at",
    "rq"."status" AS "retry_status",
    "c"."name" AS "campaign_name",
    "e"."subject" AS "email_subject",
    "count"(*) OVER (PARTITION BY "ee"."user_id", ("date_trunc"('day'::"text", "ee"."created_at"))) AS "daily_error_count"
   FROM (((("public"."email_errors" "ee"
     LEFT JOIN "public"."retry_queue" "rq" ON (("ee"."id" = "rq"."error_id")))
     LEFT JOIN "auth"."users" "u" ON (("ee"."user_id" = "u"."id")))
     LEFT JOIN "public"."campaigns" "c" ON (("ee"."campaign_id" = "c"."id")))
     LEFT JOIN "public"."emails" "e" ON (("ee"."email_id" = "e"."id")))
  WHERE ("ee"."user_id" = "auth"."uid"());


ALTER TABLE "public"."error_monitoring" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."error_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "error_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_notification_type" CHECK (("notification_type" = ANY (ARRAY['error'::"text", 'retry_failed'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."error_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."function_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "function_name" "text" NOT NULL,
    "error_message" "text" NOT NULL,
    "error_stack" "text",
    "metadata" "jsonb",
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."function_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generation_status" (
    "campaign_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "start_date" timestamp with time zone NOT NULL,
    "current_batch" integer DEFAULT 0 NOT NULL,
    "total_emails" integer,
    "completed_emails" integer DEFAULT 0,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "generation_status_status_check" CHECK (("status" = ANY (ARRAY['generating'::"text", 'completed'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."generation_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "stripe_invoice_id" "text" NOT NULL,
    "amount_due" integer NOT NULL,
    "amount_paid" integer NOT NULL,
    "status" "text" NOT NULL,
    "billing_reason" "text" NOT NULL,
    "invoice_pdf" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "level" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'unread'::"text" NOT NULL,
    "action_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notifications_status_check" CHECK (("status" = ANY (ARRAY['unread'::"text", 'read'::"text"]))),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['success'::"text", 'error'::"text", 'info'::"text", 'warning'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stripe_payment_method_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "last_four" "text" NOT NULL,
    "expiry_month" integer,
    "expiry_year" integer,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."payment_methods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "stripe_price_id" "text" NOT NULL,
    "features" "jsonb" NOT NULL,
    "limits" "jsonb" NOT NULL,
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_admin" boolean DEFAULT false
);


ALTER TABLE "public"."pricing_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "full_name" "text",
    "company_name" "text",
    "role" "text",
    "avatar_url" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "request_count" integer NOT NULL,
    "window_key" bigint NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_event_type" CHECK (("event_type" = ANY (ARRAY['success'::"text", 'exceeded'::"text"])))
);


ALTER TABLE "public"."rate_limit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "window_count" integer DEFAULT 0 NOT NULL,
    "daily_count" integer DEFAULT 0 NOT NULL,
    "last_window" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."rate_limit_monitoring" WITH ("security_invoker"='true') AS
 WITH "daily_stats" AS (
         SELECT "rate_limit_logs"."user_id",
            "date_trunc"('day'::"text", "rate_limit_logs"."created_at") AS "date",
            "sum"("rate_limit_logs"."request_count") AS "total_requests",
            "count"(*) FILTER (WHERE ("rate_limit_logs"."event_type" = 'exceeded'::"text")) AS "limit_exceeded_count",
            "max"(
                CASE
                    WHEN ("rate_limit_logs"."event_type" = 'success'::"text") THEN "rate_limit_logs"."request_count"
                    ELSE NULL::integer
                END) AS "max_requests_per_minute"
           FROM "public"."rate_limit_logs"
          GROUP BY "rate_limit_logs"."user_id", ("date_trunc"('day'::"text", "rate_limit_logs"."created_at"))
        )
 SELECT "ds"."user_id",
    "ds"."date",
    "ds"."total_requests",
    "ds"."limit_exceeded_count",
    "ds"."max_requests_per_minute",
    "u"."email" AS "user_email",
    "rl"."daily_count" AS "current_daily_count",
    "rl"."window_count" AS "current_window_count",
    (((("rl"."daily_count")::double precision / (50000)::double precision) * (100)::double precision))::numeric(5,2) AS "daily_limit_percentage",
        CASE
            WHEN ("rl"."daily_count" >= 45000) THEN 'Critical'::"text"
            WHEN ("rl"."daily_count" >= 40000) THEN 'Warning'::"text"
            WHEN ("rl"."daily_count" >= 30000) THEN 'Attention'::"text"
            ELSE 'Normal'::"text"
        END AS "status"
   FROM (("daily_stats" "ds"
     LEFT JOIN "auth"."users" "u" ON (("ds"."user_id" = "u"."id")))
     LEFT JOIN "public"."rate_limits" "rl" ON (("ds"."user_id" = "rl"."user_id")))
  WHERE ("ds"."user_id" = "auth"."uid"());


ALTER TABLE "public"."rate_limit_monitoring" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."rate_limit_status" WITH ("security_invoker"='true') AS
 SELECT "rl"."user_id",
    "u"."email" AS "user_email",
    "rl"."daily_count",
    "rl"."window_count",
    "rl"."last_window",
    "rl"."updated_at",
    (((("rl"."daily_count")::double precision / (50000)::double precision) * (100)::double precision))::numeric(5,2) AS "daily_limit_percentage",
    (50000 - "rl"."daily_count") AS "remaining_daily_limit",
        CASE
            WHEN ("rl"."daily_count" >= 45000) THEN 'Critical'::"text"
            WHEN ("rl"."daily_count" >= 40000) THEN 'Warning'::"text"
            WHEN ("rl"."daily_count" >= 30000) THEN 'Attention'::"text"
            ELSE 'Normal'::"text"
        END AS "status"
   FROM ("public"."rate_limits" "rl"
     JOIN "auth"."users" "u" ON (("rl"."user_id" = "u"."id")))
  WHERE ("rl"."user_id" = "auth"."uid"());


ALTER TABLE "public"."rate_limit_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "stripe_subscription_id" "text" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "current_period_start" timestamp with time zone NOT NULL,
    "current_period_end" timestamp with time zone NOT NULL,
    "cancel_at_period_end" boolean DEFAULT false,
    "canceled_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "trial_start" timestamp with time zone,
    "trial_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_admin" boolean DEFAULT false
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_billing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "billing_period_start" timestamp with time zone NOT NULL,
    "billing_period_end" timestamp with time zone NOT NULL,
    "type" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "base_included" integer NOT NULL,
    "overage" integer NOT NULL,
    "rate_per_unit" numeric(10,4) NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "stripe_invoice_item_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "usage_billing_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'billed'::"text", 'failed'::"text"]))),
    CONSTRAINT "usage_billing_type_check" CHECK (("type" = ANY (ARRAY['email'::"text", 'contact'::"text", 'campaign'::"text"])))
);


ALTER TABLE "public"."usage_billing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "type" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "billing_period_start" timestamp with time zone NOT NULL,
    "billing_period_end" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "usage_records_type_check" CHECK (("type" = ANY (ARRAY['email'::"text", 'contact'::"text", 'campaign'::"text"])))
);


ALTER TABLE "public"."usage_records" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_status_summary" AS
 SELECT "u"."id" AS "user_id",
    "u"."email",
    COALESCE("s"."status", 'guest'::"text") AS "subscription_status",
        CASE
            WHEN "s"."is_admin" THEN 'admin'::"text"
            WHEN ("s"."status" = 'active'::"text") THEN 'paying'::"text"
            ELSE 'guest'::"text"
        END AS "user_type",
    "p"."name" AS "plan_name",
    "s"."current_period_end" AS "subscription_end",
    "s"."created_at" AS "subscription_created"
   FROM (("auth"."users" "u"
     LEFT JOIN "public"."subscriptions" "s" ON ((("u"."id" = "s"."user_id") AND ("s"."status" = 'active'::"text"))))
     LEFT JOIN "public"."pricing_plans" "p" ON (("s"."plan_id" = "p"."id")));


ALTER TABLE "public"."user_status_summary" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_logs"
    ADD CONSTRAINT "ai_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_list_members"
    ADD CONSTRAINT "contact_list_members_pkey" PRIMARY KEY ("contact_id", "list_id");



ALTER TABLE ONLY "public"."contact_lists"
    ADD CONSTRAINT "contact_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."domain_settings"
    ADD CONSTRAINT "domain_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_errors"
    ADD CONSTRAINT "email_errors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "email_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."emails"
    ADD CONSTRAINT "emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."error_notifications"
    ADD CONSTRAINT "error_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."function_logs"
    ADD CONSTRAINT "function_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generation_status"
    ADD CONSTRAINT "generation_status_pkey" PRIMARY KEY ("campaign_id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_stripe_invoice_id_key" UNIQUE ("stripe_invoice_id");



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_stripe_payment_method_id_key" UNIQUE ("stripe_payment_method_id");



ALTER TABLE ONLY "public"."pricing_plans"
    ADD CONSTRAINT "pricing_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_plans"
    ADD CONSTRAINT "pricing_plans_stripe_price_id_key" UNIQUE ("stripe_price_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit_logs"
    ADD CONSTRAINT "rate_limit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."retry_queue"
    ADD CONSTRAINT "retry_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."usage_billing"
    ADD CONSTRAINT "usage_billing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_records"
    ADD CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id");



CREATE INDEX "contacts_search_vector_idx" ON "public"."contacts" USING "gin" ("search_vector");



CREATE UNIQUE INDEX "domain_settings_domain_idx" ON "public"."domain_settings" USING "btree" ("domain");



CREATE INDEX "domain_settings_sender_email_idx" ON "public"."domain_settings" USING "btree" ("sender_email");



CREATE INDEX "domain_settings_status_idx" ON "public"."domain_settings" USING "btree" ("status");



CREATE INDEX "domain_settings_user_id_idx" ON "public"."domain_settings" USING "btree" ("user_id");



CREATE INDEX "idx_campaigns_user_id" ON "public"."campaigns" USING "btree" ("user_id");



CREATE INDEX "idx_contacts_campaign" ON "public"."contacts" USING "btree" ("campaign_id");



CREATE INDEX "idx_email_errors_campaign_id" ON "public"."email_errors" USING "btree" ("campaign_id");



CREATE INDEX "idx_email_errors_created_at" ON "public"."email_errors" USING "btree" ("created_at");



CREATE INDEX "idx_email_errors_email_id" ON "public"."email_errors" USING "btree" ("email_id");



CREATE INDEX "idx_email_errors_status" ON "public"."email_errors" USING "btree" ("status");



CREATE INDEX "idx_email_errors_user_id" ON "public"."email_errors" USING "btree" ("user_id");



CREATE INDEX "idx_email_events_campaign_id" ON "public"."email_events" USING "btree" ("campaign_id");



CREATE INDEX "idx_email_events_email_id" ON "public"."email_events" USING "btree" ("email_id");



CREATE INDEX "idx_email_events_event_type" ON "public"."email_events" USING "btree" ("event_type");



CREATE INDEX "idx_email_events_occurred_at" ON "public"."email_events" USING "btree" ("occurred_at");



CREATE INDEX "idx_email_events_user_id" ON "public"."email_events" USING "btree" ("user_id");



CREATE INDEX "idx_emails_campaign_id" ON "public"."emails" USING "btree" ("campaign_id");



CREATE INDEX "idx_emails_scheduled" ON "public"."emails" USING "btree" ("status", "scheduled_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_emails_status_scheduled" ON "public"."emails" USING "btree" ("status", "scheduled_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_error_notifications_user_id" ON "public"."error_notifications" USING "btree" ("user_id");



CREATE INDEX "idx_function_logs_function_name" ON "public"."function_logs" USING "btree" ("function_name");



CREATE INDEX "idx_function_logs_timestamp" ON "public"."function_logs" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_generation_status_status" ON "public"."generation_status" USING "btree" ("status");



CREATE INDEX "idx_generation_status_updated_at" ON "public"."generation_status" USING "btree" ("updated_at");



CREATE INDEX "idx_invoices_subscription_id" ON "public"."invoices" USING "btree" ("subscription_id");



CREATE INDEX "idx_invoices_user_id" ON "public"."invoices" USING "btree" ("user_id");



CREATE INDEX "idx_logs_level_created_at" ON "public"."logs" USING "btree" ("level", "created_at");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_status" ON "public"."notifications" USING "btree" ("status");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_payment_methods_user_id" ON "public"."payment_methods" USING "btree" ("user_id");



CREATE INDEX "idx_rate_limit_logs_created_at" ON "public"."rate_limit_logs" USING "btree" ("created_at");



CREATE INDEX "idx_rate_limit_logs_user_id" ON "public"."rate_limit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_rate_limits_user_id" ON "public"."rate_limits" USING "btree" ("user_id");



CREATE INDEX "idx_retry_queue_next_retry" ON "public"."retry_queue" USING "btree" ("next_retry_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_retry_queue_status" ON "public"."retry_queue" USING "btree" ("status");



CREATE INDEX "idx_subscriptions_plan_id" ON "public"."subscriptions" USING "btree" ("plan_id");



CREATE INDEX "idx_subscriptions_user_id" ON "public"."subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_usage_billing_status" ON "public"."usage_billing" USING "btree" ("status");



CREATE INDEX "idx_usage_billing_subscription" ON "public"."usage_billing" USING "btree" ("subscription_id");



CREATE INDEX "idx_usage_billing_user_period" ON "public"."usage_billing" USING "btree" ("user_id", "billing_period_start", "billing_period_end");



CREATE INDEX "idx_usage_records_subscription" ON "public"."usage_records" USING "btree" ("subscription_id");



CREATE INDEX "idx_usage_records_type" ON "public"."usage_records" USING "btree" ("type");



CREATE INDEX "idx_usage_records_user_period" ON "public"."usage_records" USING "btree" ("user_id", "billing_period_start", "billing_period_end");



CREATE OR REPLACE TRIGGER "contacts_search_vector_update" BEFORE INSERT OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."contacts_search_vector_trigger"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "track_campaign_usage" AFTER INSERT ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."record_campaign_usage"();



CREATE OR REPLACE TRIGGER "track_contact_usage" AFTER INSERT ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."record_contact_usage"();



CREATE OR REPLACE TRIGGER "track_email_usage" AFTER INSERT ON "public"."emails" FOR EACH ROW EXECUTE FUNCTION "public"."record_email_usage"();



CREATE OR REPLACE TRIGGER "update_updated_at_column" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."ai_logs"
    ADD CONSTRAINT "ai_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_logs"
    ADD CONSTRAINT "ai_logs_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contact_list_members"
    ADD CONSTRAINT "contact_list_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_list_members"
    ADD CONSTRAINT "contact_list_members_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."contact_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_lists"
    ADD CONSTRAINT "contact_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."domain_settings"
    ADD CONSTRAINT "domain_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_errors"
    ADD CONSTRAINT "email_errors_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."email_errors"
    ADD CONSTRAINT "email_errors_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_errors"
    ADD CONSTRAINT "email_errors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "email_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "email_events_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id");



ALTER TABLE ONLY "public"."email_events"
    ADD CONSTRAINT "email_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."error_notifications"
    ADD CONSTRAINT "error_notifications_error_id_fkey" FOREIGN KEY ("error_id") REFERENCES "public"."email_errors"("id");



ALTER TABLE ONLY "public"."error_notifications"
    ADD CONSTRAINT "error_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "fk_campaigns_user" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."emails"
    ADD CONSTRAINT "fk_emails_campaign" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generation_status"
    ADD CONSTRAINT "generation_status_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."rate_limit_logs"
    ADD CONSTRAINT "rate_limit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."retry_queue"
    ADD CONSTRAINT "retry_queue_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id");



ALTER TABLE ONLY "public"."retry_queue"
    ADD CONSTRAINT "retry_queue_error_id_fkey" FOREIGN KEY ("error_id") REFERENCES "public"."email_errors"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."pricing_plans"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."usage_billing"
    ADD CONSTRAINT "usage_billing_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id");



ALTER TABLE ONLY "public"."usage_billing"
    ADD CONSTRAINT "usage_billing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."usage_records"
    ADD CONSTRAINT "usage_records_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id");



ALTER TABLE ONLY "public"."usage_records"
    ADD CONSTRAINT "usage_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Authenticated users can read app_settings" ON "public"."app_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read function logs" ON "public"."function_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can read logs" ON "public"."logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Pricing plans are readable by all authenticated users" ON "public"."pricing_plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public can view active pricing plans" ON "public"."pricing_plans" FOR SELECT TO "anon" USING ((("is_active" = true) AND ("is_admin" = false)));



CREATE POLICY "Service role can access all campaigns" ON "public"."campaigns" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can access all emails" ON "public"."emails" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage all error notifications" ON "public"."error_notifications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage all errors" ON "public"."email_errors" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage all notifications" ON "public"."notifications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage all retry queue entries" ON "public"."retry_queue" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage error notifications" ON "public"."error_notifications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage errors" ON "public"."email_errors" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage rate limit logs" ON "public"."rate_limit_logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage rate limits" ON "public"."rate_limits" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage retry queue" ON "public"."retry_queue" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to app_settings" ON "public"."app_settings" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to data migration backup" ON "public"."data_migration_backup_20240327" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to email events" ON "public"."email_events" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to function logs" ON "public"."function_logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to invoices" ON "public"."invoices" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to logs" ON "public"."logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to payment methods" ON "public"."payment_methods" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to pricing plans" ON "public"."pricing_plans" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to subscriptions" ON "public"."subscriptions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to usage billing" ON "public"."usage_billing" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to usage records" ON "public"."usage_records" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Users can create campaigns" ON "public"."campaigns" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create contact lists" ON "public"."contact_lists" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create contacts" ON "public"."contacts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete emails from own campaigns" ON "public"."emails" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "emails"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete emails in their campaigns" ON "public"."emails" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "emails"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own campaigns" ON "public"."campaigns" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own contact lists" ON "public"."contact_lists" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own contacts" ON "public"."contacts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own campaigns" ON "public"."campaigns" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert ai_logs for own campaigns" ON "public"."ai_logs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "ai_logs"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert emails for own campaigns" ON "public"."emails" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "emails"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert emails to their campaigns" ON "public"."emails" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "emails"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own campaigns" ON "public"."campaigns" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own domain settings" ON "public"."domain_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own notifications" ON "public"."notifications" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Users can manage own contact list members" ON "public"."contact_list_members" USING ((EXISTS ( SELECT 1
   FROM "public"."contact_lists"
  WHERE (("contact_lists"."id" = "contact_list_members"."list_id") AND ("contact_lists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage their own error notifications" ON "public"."error_notifications" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own errors" ON "public"."email_errors" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own generation status" ON "public"."generation_status" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "generation_status"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "generation_status"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage their own retry queue entries" ON "public"."retry_queue" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."email_errors"
  WHERE (("email_errors"."id" = "retry_queue"."error_id") AND ("email_errors"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."email_errors"
  WHERE (("email_errors"."id" = "retry_queue"."error_id") AND ("email_errors"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can read their own error notifications" ON "public"."error_notifications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own errors" ON "public"."email_errors" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own invoices" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own logs" ON "public"."logs" FOR SELECT TO "authenticated" USING ((("metadata" ->> 'user_id'::"text") = ("auth"."uid"())::"text"));



CREATE POLICY "Users can read their own payment methods" ON "public"."payment_methods" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own rate limit logs" ON "public"."rate_limit_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own rate limits" ON "public"."rate_limits" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own retry queue" ON "public"."retry_queue" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."email_errors"
  WHERE (("email_errors"."id" = "retry_queue"."error_id") AND ("email_errors"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can read their own subscriptions" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update emails from own campaigns" ON "public"."emails" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "emails"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update emails in their campaigns" ON "public"."emails" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "emails"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "emails"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own campaigns" ON "public"."campaigns" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own contact lists" ON "public"."contact_lists" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own contacts" ON "public"."contacts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own campaigns" ON "public"."campaigns" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own domain settings" ON "public"."domain_settings" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (true);



CREATE POLICY "Users can view ai_logs from own campaigns" ON "public"."ai_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "ai_logs"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view emails from own campaigns" ON "public"."emails" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "emails"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view emails in their campaigns" ON "public"."emails" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "emails"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own campaigns" ON "public"."campaigns" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own contact list members" ON "public"."contact_list_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."contact_lists"
  WHERE (("contact_lists"."id" = "contact_list_members"."list_id") AND ("contact_lists"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own contact lists" ON "public"."contact_lists" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own contacts" ON "public"."contacts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own campaigns" ON "public"."campaigns" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own domain settings" ON "public"."domain_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own email events" ON "public"."email_events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own usage billing" ON "public"."usage_billing" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own usage records" ON "public"."usage_records" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."ai_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_list_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_migration_backup_20240327" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."domain_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_errors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."emails" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."error_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."function_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generation_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."retry_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_billing" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_records" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


CREATE PUBLICATION "supabase_realtime_messages_publication" WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION "supabase_realtime_messages_publication" OWNER TO "supabase_admin";








GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";















































































































































































































GRANT ALL ON FUNCTION "public"."calculate_usage_billing"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_usage_billing"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_usage_billing"("p_user_id" "uuid", "p_subscription_id" "uuid", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."clean_old_generation_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."clean_old_generation_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clean_old_generation_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."contacts_search_vector_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."contacts_search_vector_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."contacts_search_vector_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_admin_subscription"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_admin_subscription"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_admin_subscription"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pending_emails"("batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_pending_emails"("batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pending_emails"("batch_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_setting"("p_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_setting"("p_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_setting"("p_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."invoke_billing_calculation"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoke_billing_calculation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoke_billing_calculation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_campaign_usage"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_campaign_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_campaign_usage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_contact_usage"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_contact_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_contact_usage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_email_usage"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_email_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_email_usage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_campaign_analytics"("p_campaign_id" "uuid", "p_event_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_campaign_analytics"("p_campaign_id" "uuid", "p_event_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_campaign_analytics"("p_campaign_id" "uuid", "p_event_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_contact_engagement_score"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_contact_engagement_score"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_contact_engagement_score"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_admin_setup"() TO "anon";
GRANT ALL ON FUNCTION "public"."verify_admin_setup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_admin_setup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_pricing_setup"() TO "anon";
GRANT ALL ON FUNCTION "public"."verify_pricing_setup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_pricing_setup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";
























GRANT ALL ON TABLE "public"."ai_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_logs" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."contact_list_members" TO "anon";
GRANT ALL ON TABLE "public"."contact_list_members" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_list_members" TO "service_role";



GRANT ALL ON TABLE "public"."contact_lists" TO "anon";
GRANT ALL ON TABLE "public"."contact_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_lists" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."data_migration_backup_20240327" TO "anon";
GRANT ALL ON TABLE "public"."data_migration_backup_20240327" TO "authenticated";
GRANT ALL ON TABLE "public"."data_migration_backup_20240327" TO "service_role";



GRANT ALL ON TABLE "public"."domain_settings" TO "anon";
GRANT ALL ON TABLE "public"."domain_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."domain_settings" TO "service_role";



GRANT ALL ON TABLE "public"."email_errors" TO "anon";
GRANT ALL ON TABLE "public"."email_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."email_errors" TO "service_role";



GRANT ALL ON TABLE "public"."email_events" TO "anon";
GRANT ALL ON TABLE "public"."email_events" TO "authenticated";
GRANT ALL ON TABLE "public"."email_events" TO "service_role";



GRANT ALL ON TABLE "public"."emails" TO "anon";
GRANT ALL ON TABLE "public"."emails" TO "authenticated";
GRANT ALL ON TABLE "public"."emails" TO "service_role";



GRANT ALL ON TABLE "public"."retry_queue" TO "anon";
GRANT ALL ON TABLE "public"."retry_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."retry_queue" TO "service_role";



GRANT ALL ON TABLE "public"."error_monitoring" TO "anon";
GRANT ALL ON TABLE "public"."error_monitoring" TO "authenticated";
GRANT ALL ON TABLE "public"."error_monitoring" TO "service_role";



GRANT ALL ON TABLE "public"."error_notifications" TO "anon";
GRANT ALL ON TABLE "public"."error_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."error_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."function_logs" TO "anon";
GRANT ALL ON TABLE "public"."function_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."function_logs" TO "service_role";



GRANT ALL ON TABLE "public"."generation_status" TO "anon";
GRANT ALL ON TABLE "public"."generation_status" TO "authenticated";
GRANT ALL ON TABLE "public"."generation_status" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."logs" TO "anon";
GRANT ALL ON TABLE "public"."logs" TO "authenticated";
GRANT ALL ON TABLE "public"."logs" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_methods" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_plans" TO "anon";
GRANT ALL ON TABLE "public"."pricing_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_plans" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_logs" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_monitoring" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_monitoring" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_monitoring" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_status" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_status" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_status" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."usage_billing" TO "anon";
GRANT ALL ON TABLE "public"."usage_billing" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_billing" TO "service_role";



GRANT ALL ON TABLE "public"."usage_records" TO "anon";
GRANT ALL ON TABLE "public"."usage_records" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_records" TO "service_role";



GRANT ALL ON TABLE "public"."user_status_summary" TO "anon";
GRANT ALL ON TABLE "public"."user_status_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."user_status_summary" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
