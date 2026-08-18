import { requireAdmin } from "@/lib/adminAuth";
import { toggleHiddenTrail } from "@/app/admin/actions";
import ConfirmButton from "@/components/admin/ConfirmButton";

export const dynamic = "force-dynamic";

// Beheerscherm voor de OSM-trail-import. Bestond nog niet: verborgen trails
// (hidden_at) waren alléén te zien doordat een ingelogde admin de PUBLIEKE
// /trails-pagina opende — RLS geeft admins daar de verborgen rijen terug. Dat
// maakte die publieke pagina bezoeker-afhankelijk en dus niet CDN-cachebaar
// (zie SEO_AUDIT.md P2-4). Met dit scherm heeft de admin een eigen plek en kan
// /trails viewer-onafhankelijk worden.
export default async function AdminTrailsPage({
  searchParams,
}: {
  searchParams: { q?: string; f?: string };
}) {
  const { sb } = await requireAdmin();
  let q = sb
    .from("trails")
    .select("id,name,sport,region,country,hidden_at,is_gravel,stats")
    .order("name_sort")
    .limit(200);
  if (searchParams.q) q = q.ilike("name", `%${searchParams.q}%`);
  if (searchParams.f === "hidden") q = q.not("hidden_at", "is", null);
  if (searchParams.f === "visible") q = q.is("hidden_at", null);
  const { data } = await q;
  const trails = data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Trails</h1>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Search by name…"
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
          />
        </form>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Official OpenStreetMap routes. Hiding a trail removes it from the public
        site, the sitemap and the region pages.
      </p>
      <div className="mt-2 flex gap-1 text-xs">
        {[
          ["", "all"],
          ["visible", "visible"],
          ["hidden", "hidden"],
        ].map(([v, label]) => (
          <a
            key={label}
            href={`/admin/trails${v ? `?f=${v}` : ""}`}
            className={`rounded-full px-3 py-1 font-medium capitalize ${
              (searchParams.f ?? "") === v
                ? "bg-neutral-800 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {label}
          </a>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {trails.length === 0 && (
          <div className="px-4 py-6 text-sm text-neutral-400">No trails found.</div>
        )}
        {trails.map((t) => (
          <div
            key={t.id}
            className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 py-2.5 last:border-0"
          >
            <span>{t.hidden_at ? "🚫" : "🥾"}</span>
            <div className="min-w-0 flex-1">
              <a
                href={`/nl/trail/${t.id}`}
                target="_blank"
                className="text-sm font-medium text-neutral-900 hover:underline"
              >
                {t.name}
              </a>
              <div className="text-xs text-neutral-500">
                {(((t.stats as { distanceM?: number })?.distanceM ?? 0) / 1000).toFixed(1)} km ·{" "}
                {t.is_gravel ? "gravel" : t.sport}
                {t.region && ` · ${t.region}`}
                {t.country && ` (${t.country})`}
                {t.hidden_at && <span className="ml-1 text-red-600">hidden</span>}
              </div>
            </div>
            <form action={toggleHiddenTrail}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="hide" value={t.hidden_at ? "0" : "1"} />
              {t.hidden_at ? (
                <button
                  type="submit"
                  className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
                >
                  Unhide
                </button>
              ) : (
                <ConfirmButton label="Hide" message="Hide this trail from the public site?" />
              )}
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
