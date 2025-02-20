-- Enable the pg_trgm extension for trigram matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add a generated column for text search
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS search_vector tsvector 
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(email, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(first_name, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(last_name, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(company, '')), 'C')
) STORED;

-- Create a GIN index for fast text search
CREATE INDEX IF NOT EXISTS contacts_search_vector_idx ON contacts USING GIN (search_vector);

-- Create a function to update search_vector on contact changes
CREATE OR REPLACE FUNCTION contacts_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.email, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.first_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.last_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.company, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS contacts_search_vector_update ON contacts;
CREATE TRIGGER contacts_search_vector_update
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION contacts_search_vector_trigger(); 