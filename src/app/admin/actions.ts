"use server";

// Admin server actions (fase B). Contract: EVERY action starts with
// requireAdmin() (layouts do not protect actions) and every mutation ends
// with an admin_audit insert. Data mutations run on the ADMIN'S session —
// RLS is_admin() policies are the backstop. The service-role client is
// used only for auth-admin operations (ban/unban/delete/list emails).

import { revalidatePath } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function audit(
  sb: SupabaseClient,
  user: User,
  action: string,
  subjectType: string,
  subjectId: string,
  meta: Record<string, unknown> = {},
) {
  await sb.from("admin_audit").insert({
    actor: user.id,
    action,
    subject_type: subjectType,
    subject_id: subjectId,
    meta,
  });
}

export async function resolveReport(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")); // resolved | dismissed
  const note = String(formData.get("note") ?? "");
  await sb
    .from("reports")
    .update({
      status,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      resolution_note: note || null,
    })
    .eq("id", id);
  await audit(sb, user, `report_${status}`, "report", id, { note });
  revalidatePath("/admin/reports");
}

export async function softDeleteComment(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  await sb
    .from("tour_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  await audit(sb, user, "comment_soft_delete", "comment", id);
  revalidatePath("/admin/reports");
}

export async function unpublishTour(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  await sb.from("tours").update({ visibility: "private" }).eq("id", id);
  await audit(sb, user, "tour_unpublish", "tour", id);
  revalidatePath("/admin/reports");
  revalidatePath("/admin/tours");
}

// Suspend = RLS flag (hides existing content) + auth ban (blocks login).
// The ban half needs the service role; without the key we still set the
// flag and report the limitation honestly.
export async function suspendUser(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  await sb
    .from("profiles")
    .update({ suspended_at: new Date().toISOString() })
    .eq("id", id);
  const admin = supabaseAdmin();
  let banned = false;
  if (admin) {
    const { error } = await admin.auth.admin.updateUserById(id, {
      ban_duration: "876600h", // ~100 years
    });
    banned = !error;
  }
  await audit(sb, user, "user_suspend", "profile", id, {
    auth_ban: banned,
    note: banned ? undefined : "service-role key missing — content hidden, login NOT blocked",
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
}

export async function unsuspendUser(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  await sb.from("profiles").update({ suspended_at: null }).eq("id", id);
  const admin = supabaseAdmin();
  let unbanned = false;
  if (admin) {
    const { error } = await admin.auth.admin.updateUserById(id, {
      ban_duration: "none",
    });
    unbanned = !error;
  }
  await audit(sb, user, "user_unsuspend", "profile", id, { auth_unban: unbanned });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
}

// Hard delete: auth user (cascades data via FKs) + their storage prefixes.
// Service-role only — refuses politely when the key is missing.
export async function deleteUserAccount(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  if (id === user.id) throw new Error("refusing to delete the admin account");
  const admin = supabaseAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");

  for (const bucket of ["avatars", "highlight-photos"]) {
    const { data: files } = await admin.storage.from(bucket).list(id, { limit: 100 });
    if (files && files.length > 0) {
      await admin.storage.from(bucket).remove(files.map((f) => `${id}/${f.name}`));
    }
  }
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);
  await audit(sb, user, "user_delete", "profile", id);
  revalidatePath("/admin/users");
}
