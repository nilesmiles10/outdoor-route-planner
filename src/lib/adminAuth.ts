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
  // Multi-admin: the app_metadata.role claim is the gate (only settable via
  // service role / dashboard, so tamper-proof). ADMIN_USER_ID no longer
  // restricts access — it marks the OWNER, who cannot be demoted/deleted
  // from the admin UI (see setAdminRole/deleteUserAccount).
  const allowed =
    user &&
    (user.app_metadata as { role?: string } | undefined)?.role === "admin";
  if (!allowed || !user) {
    throw new Error("admin_required");
  }
  // Self-arming 2FA rule: once the admin has a verified TOTP factor
  // (nextLevel aal2), the session MUST be at aal2. Before enrollment this
  // passes untouched — no deploy-ordering/lockout risk. The RLS layer gets
  // the matching aal2 check in a separate migration after enrollment.
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    throw new Error("admin_mfa_required");
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
