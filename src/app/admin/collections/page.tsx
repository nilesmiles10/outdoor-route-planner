import { requireAdmin } from "@/lib/adminAuth";
import { toggleEditorialCollection } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

// Collection curation (fase C): editorial flag — flagged collections lead
// the public /collections page.
export default async function AdminCollectionsPage() {
  const { sb } = await requireAdmin();
  const { data } = await sb
    .from("collections")
    .select("id,title,visibility,editorial_at,owner,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = data ?? [];

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Collections</h1>
      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center gap-3 border-b border-neutral-100 px-4 py-2.5 last:border-0">
            <div className="min-w-0 flex-1">
              <a
                href={`/nl/collection/${c.id}`}
                target="_blank"
                className="text-sm font-medium text-neutral-900 hover:underline"
              >
                {c.title}
              </a>
              <div className="text-xs text-neutral-500">
                <span className={c.visibility === "public" ? "text-emerald-700" : ""}>{c.visibility}</span>
                {c.editorial_at && <span className="ml-1 text-purple-700">✦ editorial</span>}
              </div>
            </div>
            {c.visibility === "public" && (
              <form action={toggleEditorialCollection}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="on" value={c.editorial_at ? "0" : "1"} />
                <button
                  type="submit"
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    c.editorial_at
                      ? "bg-purple-100 text-purple-800 hover:bg-purple-200"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  {c.editorial_at ? "✦ Remove editorial" : "✧ Make editorial"}
                </button>
              </form>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="px-4 py-6 text-sm text-neutral-400">No collections.</p>}
      </div>
    </div>
  );
}
