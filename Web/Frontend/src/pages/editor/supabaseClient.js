import { createClient } from "@supabase/supabase-js";

// Vite uses import.meta.env. We provide fallback dummy values so the app doesn't crash 
// if Supabase is not configured (as it supports local memory storage).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder_key";

export const supabase = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY 
    ? createClient(supabaseUrl, supabaseKey) 
    : null;
