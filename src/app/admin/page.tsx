import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// Dashboard (fase A): key counts + open-reports badge + recent audit rows.
// All queries run with the admin session — RLS is_admin() policies grant
// the reads that regular users don't get (reports, audit).
export default async function AdminDashboard() {
  const { sb } = await requireAdmin();

  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [users, users7d, tours, publicTours, activities, highlights, collections, openReports, audit] =
    await Promise.all([
      sb.from("profiles").select("id", { count: "exact", head: true }),
      sb.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since7d),
      sb.from("tours").select("id", { count: "exact", head: true }),
      sb.from("tours").select("id", { count: "exact", head: true }).eq("visibility", "public").eq("kind", "planned"),
      sb.from("tours").select("id", { count: "exact", head: true }).eq("kind", "completed"),
      sb.from("highlights").select("id", { count: "exact", head: true }),
      sb.from("collections").select("id", { count: "exact", head: true }),
      sb.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      sb
        .from("admin_audit")
        .select("id,action,subject_type,subject_id,created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  // Fase E: geo-proxy-gebruik laatste uur uit de rate-limit-vensters.
  const { data: rl } = await sb
    .from("rate_limits")
    .select("key,count,window_start")
    .gte("window_start", new Date(Date.now() - 3600_000).toISOString());
  const geoUse = new Map<string, number>();
  for (const r of rl ?? []) {
    const bucket = (r.key as string).split(":")[0];
    geoUse.set(bucket, (geoUse.get(bucket) ?? 0) + (r.count as number));
  }

  const stats: [string, number | null, string?][] = [
    ["Users", users.count, `+${users7d.count ?? 0} last 7d`],
    ["Tours (all)", tours.count],
    ["Public routes", publicTours.count],
    ["Activities", activities.count],
    ["Highlights", highlights.count],
    ["Collections", collections.count],
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
        <a
          href="/admin/reports"
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            (openReports.count ?? 0) > 0
              ? "bg-red-100 text-red-800"
              : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {openReports.count ?? 0} open reports
        </a>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, n, sub]) => (
          <div key={label} className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="text-2xl font-semibold text-neutral-900">{n ?? "–"}</div>
            <div className="text-xs text-neutral-500">{label}</div>
            {sub && <div className="text-[11px] text-emerald-700">{sub}</div>}
          </div>
        ))}
      </div>

      <h2 className="mt-8 mb-2 text-sm font-semibold text-neutral-700">Geo requests (last hour)</h2>
      <div className="flex gap-3">
        {["geo-route", "geo-search", "geo-reverse"].map((b) => (
          <div key={b} className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
            <span className="text-lg font-semibold text-neutral-900">{geoUse.get(b) ?? 0}</span>
            <span className="ml-2 text-xs text-neutral-500">{b.replace("geo-", "")}</span>
          </div>
        ))}
      </div>

      <h2 className="mt-8 mb-2 text-sm font-semibold text-neutral-700">Recent admin actions</h2>
      {(audit.data ?? []).length === 0 ? (
        <p className="text-sm text-neutral-400">No admin actions yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {(audit.data ?? []).map((a) => (
            <div key={a.id} className="flex items-baseline gap-3 border-b border-neutral-100 px-3 py-2 text-sm last:border-0">
              <span className="font-medium text-neutral-800">{a.action}</span>
              <span className="text-neutral-500">
                {a.subject_type} {a.subject_id}
              </span>
              <span className="ml-auto text-xs text-neutral-400">
                {new Date(a.created_at).toLocaleString("nl-NL")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
