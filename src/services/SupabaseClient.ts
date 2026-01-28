import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

// Create Supabase client
const supabaseUrl = SUPABASE_URL || '';
const supabaseAnonKey = SUPABASE_ANON_KEY || '';

// Supabase credentials validation happens at runtime

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
