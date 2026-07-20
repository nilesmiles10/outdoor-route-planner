import { requireAdmin } from "@/lib/adminAuth";
import { updateSiteSettings } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

// Site settings: brand name, taglines and logo — the things that would
// otherwise need a code sweep on the upcoming brand decision.
export default async function AdminSettingsPage() {
  const { sb } = await requireAdmin();
  const { data } = await sb
    .from("site_settings")
    .select("site_name,tagline_nl,tagline_en,logo_url,updated_at")
    .eq("id", 1)
    .maybeSingle();
  const s = data ?? {
    site_name: "Outdoor Route Planner",
    tagline_nl: "",
    tagline_en: "",
    logo_url: null,
    updated_at: null,
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Site settings</h1>
      <p className="mt-1 text-xs text-neutral-500">
        Applied everywhere within ~seconds (header, tab titles, embed badge, footers).
        OG-images and GPX creator string stay code-defined for now.
      </p>

      <form action={updateSiteSettings} className="mt-4 flex max-w-lg flex-col gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Site name</span>
          <input
            name="site_name"
            defaultValue={s.site_name}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Tagline (NL)</span>
          <input
            name="tagline_nl"
            defaultValue={s.tagline_nl}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Tagline (EN)</span>
          <input
            name="tagline_en"
            defaultValue={s.tagline_en}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
        </label>

        <div className="flex items-center gap-4">
          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-600">Logo</span>
            {s.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logo_url} alt="logo" className="h-14 w-14 rounded-lg border border-neutral-200 object-contain" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xl">
                ⛰
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 text-xs">
            <input type="file" name="logo" accept="image/png,image/jpeg,image/svg+xml,image/webp" />
            {s.logo_url && (
              <label className="flex items-center gap-1 text-neutral-500">
                <input type="checkbox" name="remove_logo" value="1" /> remove logo (back to ⛰)
              </label>
            )}
            <span className="text-neutral-400">Square works best (shown at 28×28 in the header).</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="self-start rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Save
          </button>
          {s.updated_at && (
            <span className="text-xs text-neutral-400">
              last saved {new Date(s.updated_at).toLocaleString("nl-NL")}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
