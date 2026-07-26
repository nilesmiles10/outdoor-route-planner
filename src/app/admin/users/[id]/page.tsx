import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { suspendUser, unsuspendUser, deleteUserAccount, setAdminRole } from "@/app/admin/actions";
import ConfirmButton from "@/components/admin/ConfirmButton";
import Avatar from "@/components/Avatar";

export const dynamic = "force-dynamic";

// User detail (fase B): profile + their content + suspend/delete actions.
export default async function UserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { sb, user: me } = await requireAdmin();
  const { data: p } = await sb
    .from("profiles")
    .select("id,display_name,home_region,bio,avatar_url,suspended_at,created_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!p) notFound();

  const [tours, comments, highlights, reportsAgainst] = await Promise.all([
    sb
      .from("tours")
      .select("id,name,sport,visibility,kind,created_at")
      .eq("owner", p.id)
      .order("created_at", { ascending: false })
      .limit(50),
    sb
      .from("tour_comments")
      .select("id,body,created_at,deleted_at")
      .eq("author", p.id)
      .order("created_at", { ascending: false })
      .limit(20),
    sb
      .from("highlights")
      .select("id,name,category")
      .eq("creator", p.id)
      .limit(50),
    sb
      .from("reports")
      .select("id,reason,status,created_at")
      .eq("subject_type", "profile")
      .eq("subject_id", p.id),
  ]);

  const admin = supabaseAdmin();
  let email: string | undefined;
  let lastSignIn: string | undefined;
  let banned = false;
  let isAdminUser = false;
  if (admin) {
    const { data } = await admin.auth.admin.getUserById(p.id);
    email = data.user?.email;
    lastSignIn = data.user?.last_sign_in_at ?? undefined;
    const u = data.user as { banned_until?: string } | null;
    banned = !!u?.banned_until && new Date(u.banned_until) > new Date();
    isAdminUser = (data.user?.app_metadata as { role?: string })?.role === "admin";
  }
  const isSelf = p.id === me.id;
  const isOwner = !!process.env.ADMIN_USER_ID && p.id === process.env.ADMIN_USER_ID;

  return (
    <div>
      <div className="flex flex-col items-start gap-4 sm:flex-row">
        <Avatar name={p.display_name} url={p.avatar_url} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-neutral-900">
            {p.display_name ?? p.id.slice(0, 8)}
            {p.suspended_at && (
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                SUSPENDED {banned ? "+ auth ban" : "(content only)"}
              </span>
            )}
            {isAdminUser && (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                ADMIN{isOwner ? " · owner" : ""}
              </span>
            )}
            {isSelf && !isAdminUser && (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                you
              </span>
            )}
          </h1>
          <p className="text-sm text-neutral-500">
            {email ?? "e-mail unavailable"} · {p.home_region ?? "–"} · joined{" "}
            {new Date(p.created_at).toLocaleDateString("nl-NL")} · last sign-in{" "}
            {lastSignIn ? new Date(lastSignIn).toLocaleString("nl-NL") : "–"}
          </p>
          {p.bio && <p className="mt-1 text-sm text-neutral-600">{p.bio}</p>}
          <p className="mt-1 text-xs text-neutral-400">
            <a className="hover:underline" href={`/nl/user/${p.id}`} target="_blank">
              public profile ↗
            </a>{" "}
            · id {p.id}
          </p>
        </div>
        {!isSelf && (
          <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:flex-col">
            {admin && !isOwner && (
              <form action={setAdminRole}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="on" value={isAdminUser ? "0" : "1"} />
                <ConfirmButton
                  label={isAdminUser ? "Revoke admin" : "Make admin"}
                  message={
                    isAdminUser
                      ? "Revoke admin rights? Takes effect on their next login/token refresh (≤1h)."
                      : "Grant FULL admin rights (moderation, users, settings)? Takes effect on their next login/token refresh (≤1h)."
                  }
                  className={
                    isAdminUser
                      ? "rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                      : "rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-200"
                  }
                />
              </form>
            )}
            {p.suspended_at ? (
              <form action={unsuspendUser}>
                <input type="hidden" name="id" value={p.id} />
                <ConfirmButton
                  label="Unsuspend"
                  message="Lift the suspension? Content becomes visible again and login is restored."
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                />
              </form>
            ) : (
              <form action={suspendUser}>
                <input type="hidden" name="id" value={p.id} />
                <ConfirmButton
                  label="Suspend"
                  message="Suspend this user? Their public content disappears and login is blocked."
                />
              </form>
            )}
            <form action={deleteUserAccount}>
              <input type="hidden" name="id" value={p.id} />
              <ConfirmButton
                label="Delete account"
                message={`This permanently deletes the account, all content and photos of ${p.display_name ?? p.id.slice(0, 8)}. This cannot be undone.`}
                typed={p.display_name ?? p.id.slice(0, 8)}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              />
            </form>
          </div>
        )}
      </div>

      {(reportsAgainst.data ?? []).length > 0 && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
          <span className="font-medium text-red-800">
            {(reportsAgainst.data ?? []).length} report(s) against this user
          </span>{" "}
          <a href="/admin/reports" className="text-red-700 underline">
            open queue
          </a>
        </div>
      )}

      <h2 className="mt-6 mb-2 text-sm font-semibold text-neutral-700">
        Tours ({(tours.data ?? []).length})
      </h2>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {(tours.data ?? []).map((t) => (
          <div key={t.id} className="flex items-center gap-3 border-b border-neutral-100 px-3 py-2 text-sm last:border-0">
            <span>{t.kind === "completed" ? "🏁" : "🗺"}</span>
            <a className="font-medium hover:underline" href={`/nl/tour/${t.id}`} target="_blank">
              {t.name}
            </a>
            <span className="text-xs text-neutral-400">{t.sport}</span>
            <span className={`ml-auto text-xs ${t.visibility === "public" ? "text-emerald-700" : "text-neutral-400"}`}>
              {t.visibility}
            </span>
          </div>
        ))}
        {(tours.data ?? []).length === 0 && (
          <p className="px-3 py-4 text-sm text-neutral-400">No tours.</p>
        )}
      </div>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-neutral-700">
        Recent comments ({(comments.data ?? []).length})
      </h2>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {(comments.data ?? []).map((c) => (
          <div key={c.id} className="border-b border-neutral-100 px-3 py-2 text-sm last:border-0">
            <span className={c.deleted_at ? "text-neutral-300 line-through" : "text-neutral-700"}>
              {c.body.slice(0, 160)}
            </span>
            <span className="ml-2 text-xs text-neutral-400">
              {new Date(c.created_at).toLocaleDateString("nl-NL")}
            </span>
          </div>
        ))}
        {(comments.data ?? []).length === 0 && (
          <p className="px-3 py-4 text-sm text-neutral-400">No comments.</p>
        )}
      </div>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-neutral-700">
        Highlights created ({(highlights.data ?? []).length})
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {(highlights.data ?? []).map((h) => (
          <a
            key={h.id}
            href={`/nl/highlight/${h.id}`}
            target="_blank"
            className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-200"
          >
            {h.name}
          </a>
        ))}
        {(highlights.data ?? []).length === 0 && (
          <p className="text-sm text-neutral-400">None.</p>
        )}
      </div>
    </div>
  );
}
