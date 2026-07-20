import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import Avatar from "@/components/Avatar";

export const dynamic = "force-dynamic";

// User list (fase B). Profiles come from the admin session; e-mail and
// last-sign-in need the Auth Admin API (service role) and degrade to "–"
// when the key isn't configured.
export default async function UsersPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const { sb } = await requireAdmin();
  let q = sb
    .from("profiles")
    .select("id,display_name,home_region,avatar_url,suspended_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (searchParams.q) q = q.ilike("display_name", `%${searchParams.q}%`);
  const { data } = await q;
  const profiles = data ?? [];

  const admin = supabaseAdmin();
  const authInfo = new Map<string, { email?: string; lastSignIn?: string; isAdmin?: boolean }>();
  if (admin) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
    for (const u of list?.users ?? []) {
      authInfo.set(u.id, {
        email: u.email,
        lastSignIn: u.last_sign_in_at ?? undefined,
        isAdmin: (u.app_metadata as { role?: string })?.role === "admin",
      });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Users ({profiles.length})</h1>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Search by name…"
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
          />
        </form>
      </div>
      {!admin && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          SUPABASE_SERVICE_ROLE_KEY is not configured — e-mail addresses, last sign-in,
          auth-ban and account deletion are unavailable. Suspension still hides content.
        </p>
      )}
      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {profiles.map((p) => {
          const info = authInfo.get(p.id);
          return (
            <a
              key={p.id}
              href={`/admin/users/${p.id}`}
              className="flex items-center gap-3 border-b border-neutral-100 px-4 py-2.5 last:border-0 hover:bg-neutral-50"
            >
              <Avatar name={p.display_name} url={p.avatar_url} size={32} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                  {p.display_name ?? p.id.slice(0, 8)}
                  {info?.isAdmin && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      ADMIN
                    </span>
                  )}
                  {p.suspended_at && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                      SUSPENDED
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-500">
                  {info?.email ?? "–"} · {p.home_region ?? "–"}
                </div>
              </div>
              <div className="ml-auto text-right text-xs text-neutral-400">
                <div>joined {new Date(p.created_at).toLocaleDateString("nl-NL")}</div>
                <div>
                  last seen{" "}
                  {info?.lastSignIn ? new Date(info.lastSignIn).toLocaleDateString("nl-NL") : "–"}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
