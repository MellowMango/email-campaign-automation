-- Create email_errors table for detailed error logging
CREATE TABLE IF NOT EXISTS public.email_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES public.emails(id),
    campaign_id UUID REFERENCES public.campaigns(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    error_type TEXT NOT NULL,
    error_message TEXT,
    error_stack TEXT,
    context JSONB,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT valid_error_status CHECK (status IN ('pending', 'retrying', 'resolved', 'failed'))
);

-- Create retry_queue table for managing failed email retries
CREATE TABLE IF NOT EXISTS public.retry_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES public.emails(id),
    error_id UUID NOT NULL REFERENCES public.email_errors(id),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_error TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT valid_retry_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Create error_notifications table for tracking error notifications
CREATE TABLE IF NOT EXISTS public.error_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    error_id UUID NOT NULL REFERENCES public.email_errors(id),
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT valid_notification_type CHECK (notification_type IN ('error', 'retry_failed', 'resolved'))
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_email_errors_email_id ON public.email_errors(email_id);
CREATE INDEX IF NOT EXISTS idx_email_errors_user_id ON public.email_errors(user_id);
CREATE INDEX IF NOT EXISTS idx_email_errors_status ON public.email_errors(status);
CREATE INDEX IF NOT EXISTS idx_retry_queue_status ON public.retry_queue(status);
CREATE INDEX IF NOT EXISTS idx_retry_queue_next_retry ON public.retry_queue(next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_error_notifications_user_id ON public.error_notifications(user_id);

-- Add RLS policies
ALTER TABLE public.email_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retry_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_notifications ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users and service role
GRANT ALL ON public.email_errors TO authenticated;
GRANT ALL ON public.retry_queue TO authenticated;
GRANT ALL ON public.error_notifications TO authenticated;
GRANT ALL ON public.email_errors TO service_role;
GRANT ALL ON public.retry_queue TO service_role;
GRANT ALL ON public.error_notifications TO service_role;

-- Users can read their own errors
CREATE POLICY "Users can read their own errors"
    ON public.email_errors FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can read their own retry queue
CREATE POLICY "Users can read their own retry queue"
    ON public.retry_queue FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.email_errors
        WHERE email_errors.id = retry_queue.error_id
        AND email_errors.user_id = auth.uid()
    ));

-- Users can read their own error notifications
CREATE POLICY "Users can read their own error notifications"
    ON public.error_notifications FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role can manage all tables
CREATE POLICY "Service role can manage errors"
    ON public.email_errors FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role can manage retry queue"
    ON public.retry_queue FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role can manage error notifications"
    ON public.error_notifications FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create a view for error monitoring
CREATE OR REPLACE VIEW public.error_monitoring 
WITH (security_invoker=true)
AS
SELECT 
    ee.id as error_id,
    ee.email_id,
    ee.campaign_id,
    ee.user_id,
    u.email as user_email,
    ee.error_type,
    ee.error_message,
    ee.retry_count,
    ee.status as error_status,
    ee.created_at as error_occurred_at,
    rq.id as retry_id,
    rq.next_retry_at,
    rq.status as retry_status,
    c.name as campaign_name,
    e.subject as email_subject,
    COUNT(*) OVER (PARTITION BY ee.user_id, DATE_TRUNC('day', ee.created_at)) as daily_error_count
FROM public.email_errors ee
LEFT JOIN public.retry_queue rq ON ee.id = rq.error_id
LEFT JOIN auth.users u ON ee.user_id = u.id
LEFT JOIN public.campaigns c ON ee.campaign_id = c.id
LEFT JOIN public.emails e ON ee.email_id = e.id
WHERE ee.user_id = auth.uid();

-- Grant access to the view
GRANT SELECT ON public.error_monitoring TO authenticated;
GRANT SELECT ON public.error_monitoring TO service_role; 