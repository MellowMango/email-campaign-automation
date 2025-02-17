-- Create logs table for storing execution history
CREATE TABLE IF NOT EXISTS logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  level text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add RLS policies
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to logs"
  ON logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read their own logs
CREATE POLICY "Users can read their own logs"
  ON logs
  FOR SELECT
  TO authenticated
  USING (
    metadata->>'user_id' = auth.uid()::text
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_logs_updated_at
  BEFORE UPDATE ON logs
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

-- Grant necessary permissions
GRANT SELECT, INSERT ON logs TO service_role;
GRANT SELECT ON logs TO authenticated; 