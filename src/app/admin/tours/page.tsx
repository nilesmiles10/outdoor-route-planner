import { requireAdmin } from "@/lib/adminAuth";
import { toggleFeaturedTour, unpublishTour } from "@/app/admin/actions";
import ConfirmButton from "@/components/admin/ConfirmButton";

export const dynamic = "force-dynamic";

// Tour curation (fase C): search/list, feature toggle, unpublish.
export default async function AdminToursPage({
  searchParams,
}: {
  searchParams: { q?: string; f?: string };
}) {
  const { sb } = await requireAdmin();
  let q = sb
    .from("tours")
    .select("id,name,sport,visibility,kind,featured_at,owner,created_at,stats")
    .order("created_at", { ascending: false })
    .limit(100);
  if (searchParams.q) q = q.ilike("name", `%${searchParams.q}%`);
  if (searchParams.f === "featured") q = q.not("featured_at", "is", null);
  if (searchParams.f === "public") q = q.eq("visibility", "public");
  const { data } = await q;
  const tours = data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Tours</h1>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Search by name…"
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
          />
        </form>
      </div>
      <div className="mt-2 flex gap-1 text-xs">
        {[
          ["", "all"],
          ["public", "public"],
          ["featured", "featured"],
        ].map(([v, label]) => (
          <a
            key={label}
            href={`/admin/tours${v ? `?f=${v}` : ""}`}
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
        {tours.map((t) => (
          <div
            key={t.id}
            className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 py-2.5 last:border-0"
          >
            <span>{t.kind === "completed" ? "🏁" : "🗺"}</span>
            <div className="min-w-0 flex-1">
              <a
                href={`/nl/tour/${t.id}`}
                target="_blank"
                className="text-sm font-medium text-neutral-900 hover:underline"
              >
                {t.name}
              </a>
              <div className="text-xs text-neutral-500">
                {((t.stats as { distanceM?: number })?.distanceM ?? 0) / 1000} km · {t.sport} ·{" "}
                <span className={t.visibility === "public" ? "text-emerald-700" : ""}>
                  {t.visibility}
                </span>
                {t.featured_at && <span className="ml-1 text-amber-600">★ featured</span>}
              </div>
            </div>
            {t.visibility === "public" && t.kind !== "completed" && (
              <form action={toggleFeaturedTour}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="on" value={t.featured_at ? "0" : "1"} />
                <button
                  type="submit"
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    t.featured_at
                      ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  {t.featured_at ? "★ Unfeature" : "☆ Feature"}
                </button>
              </form>
            )}
            {t.visibility === "public" && (
              <form action={unpublishTour}>
                <input type="hidden" name="id" value={t.id} />
                <ConfirmButton
                  label="Unpublish"
                  message="Set this tour to private? The owner can re-publish it themselves."
                  className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                />
              </form>
            )}
          </div>
        ))}
        {tours.length === 0 && <p className="px-4 py-6 text-sm text-neutral-400">No tours.</p>}
      </div>
    </div>
  );
}
