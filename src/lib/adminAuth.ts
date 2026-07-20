import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

// Admin gate (fase A). Called at the TOP of every admin server action and
// admin page — layouts do NOT protect server actions, so this is the real
// application-level check. RLS is_admin() policies remain the backstop:
// even if a call slips past this, Postgres refuses the data operation.
export async function requireAdmin(): Promise<{
  user: User;
  sb: SupabaseClient;
}> {
  const sb = supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  const allowed =
    user &&
    (user.app_metadata as { role?: string } | undefined)?.role === "admin" &&
    // Belt-and-braces allowlist: even a forged/mis-set claim is not enough
    // unless the uid matches the operator configured in the environment.
    (!process.env.ADMIN_USER_ID || user.id === process.env.ADMIN_USER_ID);
  if (!allowed || !user) {
    throw new Error("admin_required");
  }
  return { user, sb };
}

// Non-throwing variant for layouts/pages that want to 404 instead.
export async function getAdmin(): Promise<{
  user: User;
  sb: SupabaseClient;
} | null> {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}
