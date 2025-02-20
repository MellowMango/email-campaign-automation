-- Enable RLS on error-related tables if not already enabled
ALTER TABLE public.email_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retry_queue ENABLE ROW LEVEL SECURITY;

-- Grant access to authenticated users
GRANT ALL ON public.email_errors TO authenticated;
GRANT ALL ON public.error_notifications TO authenticated;
GRANT ALL ON public.retry_queue TO authenticated;

-- Grant access to service role
GRANT ALL ON public.email_errors TO service_role;
GRANT ALL ON public.error_notifications TO service_role;
GRANT ALL ON public.retry_queue TO service_role;

-- Policy for email_errors
CREATE POLICY "Users can manage their own errors"
    ON public.email_errors
    FOR ALL
    TO authenticated
    USING (
        auth.uid() = user_id
    )
    WITH CHECK (
        auth.uid() = user_id
    );

-- Policy for error_notifications
CREATE POLICY "Users can manage their own error notifications"
    ON public.error_notifications
    FOR ALL
    TO authenticated
    USING (
        auth.uid() = user_id
    )
    WITH CHECK (
        auth.uid() = user_id
    );

-- Policy for retry_queue
CREATE POLICY "Users can manage their own retry queue entries"
    ON public.retry_queue
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.email_errors
            WHERE email_errors.id = retry_queue.error_id
            AND email_errors.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.email_errors
            WHERE email_errors.id = retry_queue.error_id
            AND email_errors.user_id = auth.uid()
        )
    );

-- Service role policies
CREATE POLICY "Service role can manage all errors"
    ON public.email_errors
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role can manage all error notifications"
    ON public.error_notifications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role can manage all retry queue entries"
    ON public.retry_queue
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true); 