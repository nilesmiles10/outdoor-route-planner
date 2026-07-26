import { requireAdmin } from "@/lib/adminAuth";
import {
  updateHighlight,
  deleteHighlight,
  mergeHighlights,
  deleteHighlightPhoto,
} from "@/app/admin/actions";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { HIGHLIGHT_CATEGORIES, CATEGORY_EMOJI } from "@/lib/highlights";

export const dynamic = "force-dynamic";

// POI management (fase C): filterable table with inline edit, delete,
// merge (paste src+dst ids) and photo moderation. Community POIs stay
// live-on-create (besluit 2026-07-20) — this page is the after-the-fact
// moderation surface.
export default async function AdminHighlightsPage({
  searchParams,
}: {
  searchParams: { q?: string; cat?: string; creator?: string; edit?: string };
}) {
  const { sb } = await requireAdmin();
  let q = sb
    .from("highlights")
    .select("id,name,category,kind,region,creator,description,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (searchParams.q) q = q.ilike("name", `%${searchParams.q}%`);
  if (searchParams.cat) q = q.eq("category", searchParams.cat);
  if (searchParams.creator === "community") q = q.not("creator", "is", null);
  const { data } = await q;
  const rows = data ?? [];

  // Photos for the visible rows (moderation strip)
  const ids = rows.map((r) => r.id);
  const { data: photos } = ids.length
    ? await sb.from("highlight_photos").select("id,highlight_id,path,owner").in("highlight_id", ids)
    : { data: [] };
  const photosByHl = new Map<string, { id: string; path: string; owner: string }[]>();
  for (const p of photos ?? []) {
    const list = photosByHl.get(p.highlight_id) ?? [];
    list.push(p);
    photosByHl.set(p.highlight_id, list);
  }
  const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/highlight-photos/`;
  const editing = searchParams.edit;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Highlights</h1>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Search by name…"
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
          />
        </form>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-xs">
        <a
          href="/admin/highlights?creator=community"
          className={`rounded-full px-3 py-1 font-medium ${
            searchParams.creator === "community"
              ? "bg-neutral-800 text-white"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
          }`}
        >
          community-created
        </a>
        {HIGHLIGHT_CATEGORIES.map((c) => (
          <a
            key={c}
            href={`/admin/highlights?cat=${c}`}
            className={`rounded-full px-3 py-1 font-medium ${
              searchParams.cat === c
                ? "bg-neutral-800 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {CATEGORY_EMOJI[c]} {c}
          </a>
        ))}
      </div>

      {/* Merge: paste two ids (copy them from the rows below) */}
      <form
        action={mergeHighlights}
        className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2"
      >
        <span className="text-xs font-medium text-neutral-600">Merge duplicates:</span>
        <input name="src" placeholder="source id (removed)" className="w-full rounded border border-neutral-200 px-2 py-1 font-mono text-xs sm:w-64" />
        <span className="text-xs text-neutral-400">→</span>
        <input name="dst" placeholder="destination id (kept)" className="w-full rounded border border-neutral-200 px-2 py-1 font-mono text-xs sm:w-64" />
        <ConfirmButton
          label="Merge"
          message="Merge these highlights? Votes, tips and photos move to the destination; the source is deleted."
          className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
        />
      </form>

      <div className="mt-4 flex flex-col gap-2">
        {rows.map((h) => {
          const hlPhotos = photosByHl.get(h.id) ?? [];
          const isEditing = editing === h.id;
          return (
            <div key={h.id} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
              {!isEditing ? (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span>{CATEGORY_EMOJI[h.category] ?? "📍"}</span>
                      <a href={`/nl/highlight/${h.id}`} target="_blank" className="font-medium text-neutral-900 hover:underline">
                        {h.name}
                      </a>
                      {h.creator && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                          community
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {h.region ?? "–"} · <span className="select-all font-mono text-[10px]">{h.id}</span>
                    </div>
                  </div>
                  <a
                    href={`/admin/highlights?edit=${h.id}${searchParams.q ? `&q=${searchParams.q}` : ""}`}
                    className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                  >
                    ✎ Edit
                  </a>
                  <form action={deleteHighlight}>
                    <input type="hidden" name="id" value={h.id} />
                    <ConfirmButton
                      label="Delete"
                      message={`Delete "${h.name}" with all votes, tips and photos?`}
                    />
                  </form>
                </div>
              ) : (
                <form action={updateHighlight} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={h.id} />
                  <input name="name" defaultValue={h.name} className="w-56 rounded border border-neutral-200 px-2 py-1 text-sm" />
                  <select name="category" defaultValue={h.category} className="rounded border border-neutral-200 px-2 py-1 text-sm">
                    {HIGHLIGHT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input name="region" defaultValue={h.region ?? ""} placeholder="region" className="w-36 rounded border border-neutral-200 px-2 py-1 text-sm" />
                  <input name="description" defaultValue={h.description ?? ""} placeholder="description" className="w-full min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1 text-sm sm:min-w-64" />
                  <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800">
                    Save
                  </button>
                  <a href="/admin/highlights" className="text-xs text-neutral-400 hover:text-neutral-600">
                    cancel
                  </a>
                </form>
              )}

              {hlPhotos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {hlPhotos.map((p) => (
                    <div key={p.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`${storageBase}${p.path}`} alt="" className="h-16 w-16 rounded-lg object-cover" />
                      <form action={deleteHighlightPhoto} className="absolute -right-1 -top-1">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="path" value={p.path} />
                        <ConfirmButton
                          label="×"
                          message="Remove this photo?"
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white hover:bg-red-700"
                        />
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-neutral-400">No highlights match.</p>}
      </div>
    </div>
  );
}
