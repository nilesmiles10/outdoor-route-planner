"use server";

// Admin server actions (fase B). Contract: EVERY action starts with
// requireAdmin() (layouts do not protect actions) and every mutation ends
// with an admin_audit insert. Data mutations run on the ADMIN'S session —
// RLS is_admin() policies are the backstop. The service-role client is
// used only for auth-admin operations (ban/unban/delete/list emails).

import { revalidatePath, revalidateTag } from "next/cache";
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

// ---- Fase C: curatie ----

export async function toggleFeaturedTour(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  const on = String(formData.get("on")) === "1";
  await sb
    .from("tours")
    .update({ featured_at: on ? new Date().toISOString() : null })
    .eq("id", id);
  await audit(sb, user, on ? "tour_feature" : "tour_unfeature", "tour", id);
  revalidatePath("/admin/tours");
}

export async function toggleEditorialCollection(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  const on = String(formData.get("on")) === "1";
  await sb
    .from("collections")
    .update({ editorial_at: on ? new Date().toISOString() : null })
    .eq("id", id);
  await audit(sb, user, on ? "collection_editorial" : "collection_uneditorial", "collection", id);
  revalidatePath("/admin/collections");
}

export async function updateHighlight(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  const patch = {
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "other"),
    description: String(formData.get("description") ?? "").trim() || null,
    region: String(formData.get("region") ?? "").trim() || null,
  };
  await sb.from("highlights").update(patch).eq("id", id);
  await audit(sb, user, "highlight_update", "highlight", id, patch);
  revalidatePath("/admin/highlights");
}

export async function deleteHighlight(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  await sb.from("highlights").delete().eq("id", id);
  await audit(sb, user, "highlight_delete", "highlight", id);
  revalidatePath("/admin/highlights");
}

export async function mergeHighlights(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const src = String(formData.get("src"));
  const dst = String(formData.get("dst"));
  const { error } = await sb.rpc("admin_merge_highlights", { src, dst });
  if (error) throw new Error(error.message);
  // audit is written inside the RPC (same transaction)
  void user;
  revalidatePath("/admin/highlights");
}

// Photo moderation: RLS row delete (admin policy) + best-effort storage
// object removal (service role; the row is the source of truth for the UI).
export async function deleteHighlightPhoto(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  const path = String(formData.get("path"));
  await sb.from("highlight_photos").delete().eq("id", id);
  const admin = supabaseAdmin();
  if (admin && path) {
    await admin.storage.from("highlight-photos").remove([path]);
  }
  await audit(sb, user, "highlight_photo_delete", "highlight_photo", id, { path });
  revalidatePath("/admin/highlights");
}

// ---- Site settings ----

export async function updateSiteSettings(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const patch: Record<string, string | null> = {
    site_name: String(formData.get("site_name") ?? "").trim() || "Outdoor Route Planner",
    tagline_nl: String(formData.get("tagline_nl") ?? "").trim(),
    tagline_en: String(formData.get("tagline_en") ?? "").trim(),
  };
  const logo = formData.get("logo") as File | null;
  if (logo && logo.size > 0) {
    const ext = logo.name.split(".").pop()?.toLowerCase() || "png";
    // Unique name = automatic cache-bust for the public URL.
    const path = `logo-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("branding").upload(path, logo, {
      cacheControl: "31536000",
    });
    if (!error) {
      patch.logo_url = sb.storage.from("branding").getPublicUrl(path).data.publicUrl;
    }
  }
  if (String(formData.get("remove_logo")) === "1") patch.logo_url = null;
  await sb
    .from("site_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
  await audit(sb, user, "site_settings_update", "site_settings", "1", patch);
  revalidateTag("site-settings");
  revalidatePath("/admin/settings");
}
