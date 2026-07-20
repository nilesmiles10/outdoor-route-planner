import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { difficulty } from "@/lib/difficulty";
import Avatar from "@/components/Avatar";
import ProfileActions from "@/components/ProfileActions";

// GEN-118 — public profile page, the anchor of the social graph
// (Komoot-style): identity, follower counts, public routes/activities
// and collections.

type Profile = {
  id: string;
  display_name: string | null;
  home_region: string | null;
  bio: string | null;
  avatar_url: string | null;
  preferred_sports: string[];
  created_at: string;
};

async function getProfile(id: string): Promise<Profile | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("profiles")
    .select("id,display_name,home_region,bio,avatar_url,preferred_sports,created_at")
    .eq("id", id)
    .maybeSingle();
  return (data as Profile) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string; locale: string };
}): Promise<Metadata> {
  const p = await getProfile(params.id);
  if (!p) return { title: "Profile not found" };
  const t = await getTranslations("profile");
  return {
    title: `${p.display_name ?? t("anonymous")} | Outdoor Route Planner`,
    description: p.bio ?? undefined,
  };
}

export default async function UserPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const p = await getProfile(params.id);
  if (!p) notFound();
  const { locale } = params;
  const t = await getTranslations("profile");
  const tp = await getTranslations("planner");
  const tr = await getTranslations("routesPage");

  const sb = supabaseServer();
  const [followers, followingN, toursQ, colsQ] = await Promise.all([
    sb.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", p.id),
    sb.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", p.id),
    sb
      .from("tours")
      .select("id,name,sport,kind,recorded_at,stats,updated_at")
      .eq("owner", p.id)
      .eq("visibility", "public")
      .order("updated_at", { ascending: false })
      .limit(50),
    sb
      .from("collections")
      .select("id,title")
      .eq("owner", p.id)
      .eq("visibility", "public")
      .limit(20),
  ]);

  type TourLite = {
    id: string;
    name: string;
    sport: string;
    kind: "planned" | "completed";
    recorded_at: string | null;
    stats: { distanceM: number; ascendM: number };
    updated_at: string;
  };
  const tours = ((toursQ.data as TourLite[]) ?? []);
  const planned = tours.filter((x) => x.kind !== "completed");
  const completed = tours.filter((x) => x.kind === "completed");
  const collections = (colsQ.data as { id: string; title: string }[]) ?? [];
  const name = p.display_name ?? t("anonymous");

  const tourRow = (x: TourLite) => (
    <a
      key={x.id}
      href={`/${locale}/tour/${x.id}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 bg-white px-4 py-2.5 shadow-sm hover:border-emerald-200"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {x.kind === "completed" && <span aria-hidden>🏁</span>}
          <span className="truncate text-sm font-medium text-neutral-900">{x.name}</span>
        </div>
        <div className="text-xs text-neutral-500">
          {(x.stats.distanceM / 1000).toFixed(1)} km · ↗ {x.stats.ascendM} m ·{" "}
          {tp(`sports.${x.sport}` as never)} ·{" "}
          {new Date(x.kind === "completed" && x.recorded_at ? x.recorded_at : x.updated_at).toLocaleDateString(locale)}
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
          x.kind === "completed" ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"
        }`}
      >
        {tp(`difficultyLabels.${difficulty(x.sport, x.stats.distanceM, x.stats.ascendM)}` as never)}
      </span>
    </a>
  );

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-16 pt-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            name,
            description: p.bio ?? undefined,
            homeLocation: p.home_region ?? undefined,
          }),
        }}
      />
      <div className="flex items-start gap-4">
        <Avatar name={name} url={p.avatar_url} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-neutral-900">{name}</h1>
          <div className="mt-0.5 text-sm text-neutral-500">
            {p.home_region && <span>📍 {p.home_region} · </span>}
            <span>
              {followers.count ?? 0} {t("followers")} · {followingN.count ?? 0} {t("followingCount")}
            </span>
          </div>
          {p.bio && <p className="mt-1 text-sm text-neutral-600">{p.bio}</p>}
          {p.preferred_sports.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {p.preferred_sports.map((s) => (
                <span key={s} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                  {tp(`sports.${s}` as never)}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3">
            <ProfileActions profile={p} />
          </div>
        </div>
      </div>

      {completed.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">
            🏁 {tr("kinds.completed")} ({completed.length})
          </h2>
          <div className="flex flex-col gap-2">{completed.map(tourRow)}</div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-neutral-700">
          {t("publicRoutes")} ({planned.length})
        </h2>
        {planned.length === 0 ? (
          <p className="text-sm text-neutral-400">{t("noRoutes")}</p>
        ) : (
          <div className="flex flex-col gap-2">{planned.map(tourRow)}</div>
        )}
      </section>

      {collections.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">
            {t("collections")} ({collections.length})
          </h2>
          <div className="flex flex-col gap-1">
            {collections.map((c) => (
              <a
                key={c.id}
                href={`/${locale}/collection/${c.id}`}
                className="rounded-lg px-2 py-1.5 text-sm text-emerald-800 hover:bg-emerald-50"
              >
                📚 {c.title}
              </a>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-16 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
        © {new Date().getFullYear()} Outdoor Route Planner ·{" "}
        <a href="https://www.openstreetmap.org/copyright" className="hover:underline">
          © OpenStreetMap contributors
        </a>
      </footer>
    </main>
  );
}
