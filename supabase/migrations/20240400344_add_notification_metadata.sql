-- Add metadata column to notifications table
ALTER TABLE public.notifications 
ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;

-- Update RLS policies to include metadata
ALTER POLICY "Users can insert their own notifications" ON public.notifications 
USING (auth.uid() = user_id);

-- Grant necessary permissions
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role; 