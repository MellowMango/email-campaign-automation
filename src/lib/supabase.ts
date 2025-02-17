import { createClient } from '@supabase/supabase-js';

// Use environment variables from process.env if available, otherwise fall back to import.meta.env
const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseServiceKey); 