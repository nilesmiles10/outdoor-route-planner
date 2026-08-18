import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@supabase/supabase-js";
import { renderMarkdown } from "@/lib/markdown";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";
import SiteFooter from "@/components/SiteFooter";

// Pages-CMS public route. Static sibling segments (discover, routes, …)
// always win over this dynamic [slug] in Next routing; the admin editor
// refuses reserved slugs on top of that. Anonymous client: RLS only
// exposes published pages, so drafts 404 here by construction.

export const revalidate = 300;

type PageRow = {
  slug: string;
  title_nl: string;
  title_en: string;
  content_nl: string;
  content_en: string;
  meta_description_nl: string | null;
  meta_description_en: string | null;
  noindex: boolean;
  updated_at: string;
};

async function getPage(slug: string): Promise<PageRow | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data } = await sb
    .from("pages")
    .select(
      "slug,title_nl,title_en,content_nl,content_en,meta_description_nl,meta_description_en,noindex,updated_at",
    )
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  return (data as PageRow) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  const page = await getPage(params.slug);
  if (!page)
    return {
      title: (await getTranslations({ locale: params.locale, namespace: "notFound" }))("title"),
    };
  const s = await getSiteSettings();
  const nl = params.locale === "nl";
  return {
    title: pageTitle(s, nl ? page.title_nl : page.title_en),
    description: (nl ? page.meta_description_nl : page.meta_description_en) ?? undefined,
    robots: page.noindex ? { index: false, follow: true } : undefined,
    // Self-canonical op de schone slug-URL, ook voor noindex-pagina's: een
    // gedeelde link met tracking-params hoort naar het origineel te wijzen.
    alternates: { canonical: `/${params.locale}/${params.slug}` },
  };
}

export default async function CmsPage({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  const page = await getPage(params.slug);
  if (!page) notFound();
  const nl = params.locale === "nl";
  const title = nl ? page.title_nl : page.title_en;
  const html = renderMarkdown(nl ? page.content_nl : page.content_en);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 pb-16 pt-20">
      <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
      <article
        className="mt-4 text-sm text-neutral-700"
        // Safe by construction: renderMarkdown HTML-escapes ALL input before
        // applying markup; authors are admin-only on top of that.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <p className="mt-8 text-xs text-neutral-400">
        {new Date(page.updated_at).toLocaleDateString(params.locale)}
      </p>
      <SiteFooter />
    </main>
  );
}
