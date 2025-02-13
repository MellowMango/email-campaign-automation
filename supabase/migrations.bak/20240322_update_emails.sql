-- Add metadata column to emails table if it doesn't exist
ALTER TABLE public.emails
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;

-- Add sequence_type and topic fields to metadata for existing emails
UPDATE public.emails
SET metadata = metadata || 
  jsonb_build_object(
    'sequence_type', 'awareness',
    'topic', jsonb_build_object(
      'name', '',
      'description', '',
      'stage', ''
    )
  )
WHERE metadata->>'sequence_type' IS NULL;

-- Add check constraint to ensure sequence_type is valid
ALTER TABLE public.emails
ADD CONSTRAINT check_sequence_type 
CHECK (
  metadata->>'sequence_type' IN ('awareness', 'conversion', 'nurture')
); 