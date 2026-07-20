import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/adminAuth";
import { savePage, deletePage } from "@/app/admin/actions";
import ConfirmButton from "@/components/admin/ConfirmButton";

export const dynamic = "force-dynamic";

// Page editor. "new" = empty form; otherwise loads the row (admin read
// policy exposes drafts). Content is markdown-lite: ## heading, **bold**,
// *italic*, [link](url), "- " lists, blank line = paragraph.
export default async function AdminPageEditor({
  params,
}: {
  params: { id: string };
}) {
  const { sb } = await requireAdmin();
  const isNew = params.id === "new";
  let page = {
    id: "",
    slug: "",
    title_nl: "",
    title_en: "",
    content_nl: "",
    content_en: "",
    meta_description_nl: "",
    meta_description_en: "",
    published: false,
    noindex: false,
    show_in_footer: false,
  };
  if (!isNew) {
    const { data } = await sb.from("pages").select("*").eq("id", params.id).maybeSingle();
    if (!data) notFound();
    page = {
      ...data,
      meta_description_nl: data.meta_description_nl ?? "",
      meta_description_en: data.meta_description_en ?? "",
    };
  }

  const input = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm";
  const label = "mb-1 block text-xs font-medium text-neutral-600";

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">
          {isNew ? "New page" : `Edit /${page.slug}`}
        </h1>
        {!isNew && page.published && (
          <a
            href={`/nl/${page.slug}`}
            target="_blank"
            className="text-sm text-emerald-700 hover:underline"
          >
            View live ↗
          </a>
        )}
      </div>

      <form action={savePage} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="id" value={page.id} />
        <div className="flex items-end gap-3">
          <label className="text-sm">
            <span className={label}>Slug (URL: /nl/…)</span>
            <input name="slug" defaultValue={page.slug} placeholder="privacy" className={`${input} font-mono`} />
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs">
            <input type="checkbox" name="published" value="1" defaultChecked={page.published} className="accent-emerald-700" />
            Published
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs">
            <input type="checkbox" name="show_in_footer" value="1" defaultChecked={page.show_in_footer} className="accent-emerald-700" />
            In footer
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs">
            <input type="checkbox" name="noindex" value="1" defaultChecked={page.noindex} className="accent-emerald-700" />
            noindex
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <label className="text-sm">
              <span className={label}>Titel (NL)</span>
              <input name="title_nl" defaultValue={page.title_nl} className={input} />
            </label>
            <label className="text-sm">
              <span className={label}>Meta description (NL)</span>
              <input name="meta_description_nl" defaultValue={page.meta_description_nl} className={input} />
            </label>
            <label className="text-sm">
              <span className={label}>Inhoud (NL, markdown)</span>
              <textarea name="content_nl" defaultValue={page.content_nl} rows={16} className={`${input} font-mono text-xs`} />
            </label>
          </div>
          <div className="flex flex-col gap-3">
            <label className="text-sm">
              <span className={label}>Title (EN)</span>
              <input name="title_en" defaultValue={page.title_en} className={input} />
            </label>
            <label className="text-sm">
              <span className={label}>Meta description (EN)</span>
              <input name="meta_description_en" defaultValue={page.meta_description_en} className={input} />
            </label>
            <label className="text-sm">
              <span className={label}>Content (EN, markdown)</span>
              <textarea name="content_en" defaultValue={page.content_en} rows={16} className={`${input} font-mono text-xs`} />
            </label>
          </div>
        </div>
        <p className="text-xs text-neutral-400">
          Markdown: ## heading · ### subheading · **bold** · *italic* · [link](https://…) · &quot;- &quot; list · blank line = new paragraph
        </p>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Save
          </button>
          <a href="/admin/pages" className="text-sm text-neutral-400 hover:text-neutral-600">
            cancel
          </a>
        </div>
      </form>

      {!isNew && (
        <form action={deletePage} className="mt-6 border-t border-neutral-100 pt-4">
          <input type="hidden" name="id" value={page.id} />
          <input type="hidden" name="slug" value={page.slug} />
          <ConfirmButton
            label="Delete page"
            message={`Delete /${page.slug}? This cannot be undone.`}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          />
        </form>
      )}
    </div>
  );
}
