-- Create a view for rate limit monitoring
CREATE OR REPLACE VIEW public.rate_limit_monitoring 
WITH (security_invoker=true)
AS
WITH daily_stats AS (
    SELECT
        user_id,
        DATE_TRUNC('day', created_at) as date,
        SUM(request_count) as total_requests,
        COUNT(*) FILTER (WHERE event_type = 'exceeded') as limit_exceeded_count,
        MAX(CASE WHEN event_type = 'success' THEN request_count END) as max_requests_per_minute
    FROM public.rate_limit_logs
    GROUP BY user_id, DATE_TRUNC('day', created_at)
)
SELECT 
    ds.*,
    u.email as user_email,
    rl.daily_count as current_daily_count,
    rl.window_count as current_window_count,
    CAST((rl.daily_count::float / 50000 * 100) AS NUMERIC(5,2)) as daily_limit_percentage,
    CASE 
        WHEN rl.daily_count >= 45000 THEN 'Critical'
        WHEN rl.daily_count >= 40000 THEN 'Warning'
        WHEN rl.daily_count >= 30000 THEN 'Attention'
        ELSE 'Normal'
    END as status
FROM daily_stats ds
LEFT JOIN auth.users u ON ds.user_id = u.id
LEFT JOIN public.rate_limits rl ON ds.user_id = rl.user_id
WHERE ds.user_id = auth.uid();

-- Create a view for real-time rate limit status
CREATE OR REPLACE VIEW public.rate_limit_status 
WITH (security_invoker=true)
AS
SELECT 
    rl.user_id,
    u.email as user_email,
    rl.daily_count,
    rl.window_count,
    rl.last_window,
    rl.updated_at,
    CAST((rl.daily_count::float / 50000 * 100) AS NUMERIC(5,2)) as daily_limit_percentage,
    (50000 - rl.daily_count) as remaining_daily_limit,
    CASE 
        WHEN rl.daily_count >= 45000 THEN 'Critical'
        WHEN rl.daily_count >= 40000 THEN 'Warning'
        WHEN rl.daily_count >= 30000 THEN 'Attention'
        ELSE 'Normal'
    END as status
FROM public.rate_limits rl
JOIN auth.users u ON rl.user_id = u.id
WHERE rl.user_id = auth.uid();

-- Grant access to the views
GRANT SELECT ON public.rate_limit_monitoring TO authenticated;
GRANT SELECT ON public.rate_limit_status TO authenticated;
GRANT SELECT ON public.rate_limit_monitoring TO service_role;
GRANT SELECT ON public.rate_limit_status TO service_role; 