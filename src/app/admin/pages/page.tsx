import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// Pages-CMS list. The is_admin() branch of the read policy shows drafts.
export default async function AdminPagesPage() {
  const { sb } = await requireAdmin();
  const { data } = await sb
    .from("pages")
    .select("id,slug,title_nl,published,noindex,show_in_footer,updated_at")
    .order("slug");
  const rows = data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Pages</h1>
        <a
          href="/admin/pages/new"
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          + New page
        </a>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {rows.map((p) => (
          <a
            key={p.id}
            href={`/admin/pages/${p.id}`}
            className="flex items-center gap-3 border-b border-neutral-100 px-4 py-2.5 last:border-0 hover:bg-neutral-50"
          >
            <span className="font-mono text-xs text-neutral-400">/{p.slug}</span>
            <span className="text-sm font-medium text-neutral-900">{p.title_nl}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                p.published
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {p.published ? "LIVE" : "DRAFT"}
            </span>
            {p.noindex && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                noindex
              </span>
            )}
            {p.show_in_footer && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                footer
              </span>
            )}
            <span className="ml-auto text-xs text-neutral-400">
              {new Date(p.updated_at).toLocaleDateString("nl-NL")}
            </span>
          </a>
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-400">No pages yet.</p>
        )}
      </div>
    </div>
  );
}
