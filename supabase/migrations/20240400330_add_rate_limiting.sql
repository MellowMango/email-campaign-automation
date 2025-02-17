-- Create rate_limits table
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    window_count INTEGER NOT NULL DEFAULT 0,
    daily_count INTEGER NOT NULL DEFAULT 0,
    last_window BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id)
);

-- Create rate_limit_logs table
CREATE TABLE IF NOT EXISTS rate_limit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    event_type TEXT NOT NULL,
    request_count INTEGER NOT NULL,
    window_key BIGINT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT valid_event_type CHECK (event_type IN ('success', 'exceeded'))
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_id ON rate_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_user_id ON rate_limit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_created_at ON rate_limit_logs(created_at);

-- Add RLS policies
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own rate limits
CREATE POLICY "Users can read their own rate limits"
    ON rate_limits FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can read their own rate limit logs
CREATE POLICY "Users can read their own rate limit logs"
    ON rate_limit_logs FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role can manage all rate limits
CREATE POLICY "Service role can manage rate limits"
    ON rate_limits FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Service role can manage all rate limit logs
CREATE POLICY "Service role can manage rate limit logs"
    ON rate_limit_logs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true); 