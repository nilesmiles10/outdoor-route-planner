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
  if (process.env.ADMIN_USER_ID && id === process.env.ADMIN_USER_ID) {
    throw new Error("the owner account cannot be deleted");
  }
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
  patch.google_site_verification =
    String(formData.get("google_site_verification") ?? "").trim() || null;
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
  const og = formData.get("og_image") as File | null;
  if (og && og.size > 0) {
    const ext = og.name.split(".").pop()?.toLowerCase() || "png";
    const path = `og-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("branding").upload(path, og, {
      cacheControl: "31536000",
    });
    if (!error) {
      patch.og_image_url = sb.storage.from("branding").getPublicUrl(path).data.publicUrl;
    }
  }
  if (String(formData.get("remove_og")) === "1") patch.og_image_url = null;
  await sb
    .from("site_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
  await audit(sb, user, "site_settings_update", "site_settings", "1", patch);
  revalidateTag("site-settings");
  revalidatePath("/admin/settings");
}

// ---- Pages-CMS ----

// Slugs that would shadow real routes — the dynamic [slug] segment loses
// to static segments in Next anyway, but refusing them here avoids
// confusing dead pages.
const RESERVED_SLUGS = new Set([
  "collection", "collections", "discover", "feed", "highlight",
  "reset-password", "routes", "tour", "user", "admin", "embed", "api",
  "trail", "trails",
]);

export async function savePage(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || RESERVED_SLUGS.has(slug)) {
    throw new Error("invalid_or_reserved_slug");
  }
  const row = {
    slug,
    title_nl: String(formData.get("title_nl") ?? "").trim(),
    title_en: String(formData.get("title_en") ?? "").trim(),
    content_nl: String(formData.get("content_nl") ?? ""),
    content_en: String(formData.get("content_en") ?? ""),
    meta_description_nl: String(formData.get("meta_description_nl") ?? "").trim() || null,
    meta_description_en: String(formData.get("meta_description_en") ?? "").trim() || null,
    published: String(formData.get("published")) === "1",
    noindex: String(formData.get("noindex")) === "1",
    show_in_footer: String(formData.get("show_in_footer")) === "1",
    updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await sb.from("pages").update(row).eq("id", id)
    : await sb.from("pages").insert(row);
  if (error) throw new Error(error.message);
  await audit(sb, user, id ? "page_update" : "page_create", "page", id || slug, {
    slug,
    published: row.published,
  });
  revalidateTag("pages");
  for (const locale of ["nl", "en"]) revalidatePath(`/${locale}/${slug}`);
  revalidatePath("/admin/pages");
}

export async function deletePage(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  const slug = String(formData.get("slug") ?? "");
  await sb.from("pages").delete().eq("id", id);
  await audit(sb, user, "page_delete", "page", id, { slug });
  revalidateTag("pages");
  if (slug) for (const locale of ["nl", "en"]) revalidatePath(`/${locale}/${slug}`);
  revalidatePath("/admin/pages");
}

// ---- Admin-rol beheer ----

// Grant/revoke the admin role via app_metadata (service role required —
// app_metadata is exactly what makes the claim tamper-proof). Guards:
// the OWNER (ADMIN_USER_ID) can never be demoted, and you cannot demote
// yourself (no locking yourself out). Role changes reach the target's JWT
// on their next token refresh (≤1h) or next login.
export async function setAdminRole(formData: FormData) {
  const { user, sb } = await requireAdmin();
  const id = String(formData.get("id"));
  const makeAdmin = String(formData.get("on")) === "1";
  if (!makeAdmin && process.env.ADMIN_USER_ID && id === process.env.ADMIN_USER_ID) {
    throw new Error("the owner account cannot be demoted");
  }
  if (!makeAdmin && id === user.id) {
    throw new Error("you cannot demote yourself");
  }
  const admin = supabaseAdmin();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");

  // Merge-preserve existing app_metadata (provider keys etc.).
  const { data: target, error: getErr } = await admin.auth.admin.getUserById(id);
  if (getErr || !target.user) throw new Error(getErr?.message ?? "user not found");
  const meta = { ...(target.user.app_metadata ?? {}) } as Record<string, unknown>;
  if (makeAdmin) meta.role = "admin";
  else delete meta.role;
  const { error } = await admin.auth.admin.updateUserById(id, {
    app_metadata: meta,
  });
  if (error) throw new Error(error.message);
  await audit(sb, user, makeAdmin ? "admin_grant" : "admin_revoke", "profile", id);
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
}
