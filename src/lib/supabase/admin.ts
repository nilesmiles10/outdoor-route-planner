import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client (fase A/B). ONLY for operations RLS cannot express:
// auth.admin.* (ban, delete, list emails) and Storage objects under another
// user's prefix. Every call site must run requireAdmin() first — this
// client bypasses RLS entirely. Returns null when the key isn't configured
// so admin pages can degrade gracefully instead of crashing.
export function supabaseAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
