import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { supabaseServer } from "@/lib/supabase/server";
import { fmtDuration } from "@/lib/activity";
import { difficulty } from "@/lib/difficulty";
import Avatar from "@/components/Avatar";
import ProfileActions from "@/components/ProfileActions";
import ShareButton from "@/components/ShareButton";
import ProfileTimeline, { type TimelineItem } from "@/components/ProfileTimeline";
import ProfileOwnerPanels from "@/components/ProfileOwnerPanels";
import AccountSections from "@/components/AccountSections";
import SiteFooter from "@/components/SiteFooter";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";

// Profiel-v2 (Komoot-model, profile-optimization plan): identiteitskolom
// links (avatar, bio, website, counters, content-index, statistieken),
// timeline-feed rechts. Content is RLS-gefilterd (can_view_content) —
// de pagina filtert zelf niet op visibility; wat de viewer mag zien,
// komt terug. Privé-profiel zonder toegang → locked-state.

type Profile = {
  id: string;
  display_name: string | null;
  home_region: string | null;
  bio: string | null;
  avatar_url: string | null;
  preferred_sports: string[];
  website: string | null;
  privacy: "public" | "private";
  created_at: string;
};

async function getProfile(id: string): Promise<Profile | null> {
  const sb = supabaseServer();
  const { data } = await sb
    .from("profiles")
    .select(
      "id,display_name,home_region,bio,avatar_url,preferred_sports,website,privacy,created_at",
    )
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
  const name = p.display_name ?? t("anonymous");
  const bio = p.bio ?? undefined;
  return {
    title: pageTitle(await getSiteSettings(), name),
    description: bio,
    // Entity-specifieke OG i.p.v. de generieke layout-OG bij gedeelde links.
    openGraph: { title: name, description: bio },
    twitter: { title: name, description: bio },
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

  const sb = supabaseServer();
  const {
    data: { user: viewer },
  } = await sb.auth.getUser();
  const isOwner = viewer?.id === p.id;

  const [followers, followingN, toursQ, colsQ, followQ, cfQ] = await Promise.all([
    sb
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("followee_id", p.id)
      .eq("status", "accepted"),
    sb
      .from("follows")
      .select("followee_id", { count: "exact", head: true })
      .eq("follower_id", p.id)
      .eq("status", "accepted"),
    // Geen visibility-filter: RLS geeft de viewer-passende set terug
    // (owner ziet ook privé — Komoot-gedrag op het eigen profiel).
    sb
      .from("tours")
      .select("id,name,sport,kind,recorded_at,stats,moving_s,created_at,updated_at")
      .eq("owner", p.id)
      .order("created_at", { ascending: false })
      .limit(50),
    sb.from("collections").select("id,title,visibility").eq("owner", p.id).limit(20),
    viewer && !isOwner
      ? sb
          .from("follows")
          .select("status")
          .eq("follower_id", viewer.id)
          .eq("followee_id", p.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Close-friends-count: RLS is owner-only, dus alleen op eigen profiel >0.
    isOwner
      ? sb
          .from("close_friends")
          .select("friend", { count: "exact", head: true })
          .eq("owner", p.id)
      : Promise.resolve({ count: null }),
  ]);

  type TourLite = {
    id: string;
    name: string;
    sport: string;
    kind: "planned" | "completed";
    recorded_at: string | null;
    stats: { distanceM: number; ascendM: number };
    moving_s: number | null;
    created_at: string;
    updated_at: string;
  };
  const tours = (toursQ.data as TourLite[]) ?? [];
  const completed = tours.filter((x) => x.kind === "completed");
  const collections =
    (colsQ.data as { id: string; title: string; visibility: string }[]) ?? [];
  const name = p.display_name ?? t("anonymous");
  const followStatus = (followQ.data as { status?: string } | null)?.status ?? "none";

  // Locked-state: privé-profiel en de viewer heeft (voor zover zichtbaar)
  // geen toegang. Een close friend is voor ons niet queryable (owner-only
  // RLS) maar krijgt via RLS wél content terug — dan is het niet locked.
  const locked =
    p.privacy === "private" &&
    !isOwner &&
    followStatus !== "accepted" &&
    tours.length === 0 &&
    collections.length === 0;

  // Likes + comment-counts voor de timeline in twee bulk-queries.
  const ids = tours.map((x) => x.id);
  const [likesQ, commentsQ] = ids.length
    ? await Promise.all([
        sb.from("tour_likes").select("tour_id,user_id").in("tour_id", ids),
        sb
          .from("tour_comments")
          .select("tour_id")
          .in("tour_id", ids)
          .is("deleted_at", null),
      ])
    : [{ data: [] }, { data: [] }];
  const likeRows = (likesQ.data as { tour_id: string; user_id: string }[]) ?? [];
  const commentRows = (commentsQ.data as { tour_id: string }[]) ?? [];

  const timelineItems: TimelineItem[] = tours.map((x) => {
    const isCompleted = x.kind === "completed";
    return {
      id: x.id,
      name: x.name,
      kind: x.kind,
      sportLabel: tp(`sports.${x.sport}` as never),
      dateLabel: new Date(
        isCompleted && x.recorded_at ? x.recorded_at : x.created_at,
      ).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }),
      distanceKm: (x.stats.distanceM / 1000).toFixed(1),
      ascendM: x.stats.ascendM,
      difficulty: difficulty(x.sport, x.stats.distanceM, x.stats.ascendM),
      movingLabel: isCompleted && x.moving_s ? fmtDuration(x.moving_s) : null,
      likeCount: likeRows.filter((l) => l.tour_id === x.id).length,
      likedByMe: !!viewer && likeRows.some((l) => l.tour_id === x.id && l.user_id === viewer.id),
      commentCount: commentRows.filter((c) => c.tour_id === x.id).length,
    };
  });

  // Statistieken over wat de viewer mag zien (owner = alles).
  const statDistanceKm = completed.reduce((s, x) => s + x.stats.distanceM, 0) / 1000;
  const statMovingS = completed.reduce((s, x) => s + (x.moving_s ?? 0), 0);

  const websiteHref = p.website
    ? /^https?:\/\//i.test(p.website)
      ? p.website
      : `https://${p.website}`
    : null;

  const indexRow = (emoji: string, label: string, count: number) => (
    <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm">
      <span className="text-neutral-700">
        {emoji} {label}
      </span>
      <span className="font-semibold text-neutral-900">{count}</span>
    </div>
  );

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 pb-16 pt-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            name,
            description: p.bio ?? undefined,
            homeLocation: p.home_region ?? undefined,
            url: websiteHref ?? undefined,
          }),
        }}
      />
      <div className="grid gap-8 md:grid-cols-[280px_1fr]">
        {/* Identiteitskolom */}
        <div>
          <Avatar name={name} url={p.avatar_url} size={88} />
          <h1 className="mt-3 flex items-center gap-2 text-xl font-semibold text-neutral-900">
            {name}
            {p.privacy === "private" && <span title={t("privateBadge")}>🔒</span>}
          </h1>
          {p.home_region && (
            <div className="mt-0.5 text-sm text-neutral-500">📍 {p.home_region}</div>
          )}
          {p.bio && <p className="mt-1.5 text-sm text-neutral-600">{p.bio}</p>}
          {websiteHref && (
            <a
              href={websiteHref}
              target="_blank"
              rel="noopener nofollow"
              className="mt-1 block truncate text-sm text-emerald-700 hover:underline"
            >
              🌐 {p.website?.replace(/^https?:\/\//i, "")}
            </a>
          )}
          <div className="mt-3 flex gap-5 text-sm">
            <div>
              <div className="font-semibold text-neutral-900">{followers.count ?? 0}</div>
              <div className="text-xs text-neutral-500">{t("followers")}</div>
            </div>
            <div>
              <div className="font-semibold text-neutral-900">{followingN.count ?? 0}</div>
              <div className="text-xs text-neutral-500">{t("followingCount")}</div>
            </div>
            {isOwner && (
              <div>
                <div className="font-semibold text-neutral-900">{cfQ.count ?? 0}</div>
                <div className="text-xs text-neutral-500">{t("closeFriends")}</div>
              </div>
            )}
          </div>
          {p.preferred_sports.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {p.preferred_sports.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600"
                >
                  {tp(`sports.${s}` as never)}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ProfileActions profile={p} />
            <ShareButton title={name} />
          </div>

          {!locked && (
            <div className="mt-5 flex flex-col gap-1.5">
              {indexRow("🗺", t("routesRow"), tours.length - completed.length)}
              {indexRow("🏁", t("activitiesRow"), completed.length)}
              {indexRow("📚", t("collectionsRow"), collections.length)}
            </div>
          )}

          {!locked && completed.length > 0 && (
            <section className="mt-5">
              <h2 className="text-sm font-semibold text-neutral-700">{t("stats")}</h2>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-neutral-50 px-2 py-2">
                  <div className="text-base font-semibold text-neutral-900">
                    {completed.length}
                  </div>
                  <div className="text-[10px] uppercase text-neutral-500">
                    {t("statsActivities")}
                  </div>
                </div>
                <div className="rounded-lg bg-neutral-50 px-2 py-2">
                  <div className="text-base font-semibold text-neutral-900">
                    {statDistanceKm >= 100
                      ? Math.round(statDistanceKm).toLocaleString(locale)
                      : statDistanceKm.toFixed(1)}
                  </div>
                  <div className="text-[10px] uppercase text-neutral-500">km</div>
                </div>
                <div className="rounded-lg bg-neutral-50 px-2 py-2">
                  <div className="text-base font-semibold text-neutral-900">
                    {fmtDuration(statMovingS)}
                  </div>
                  <div className="text-[10px] uppercase text-neutral-500">
                    {t("statsTime")}
                  </div>
                </div>
              </div>
            </section>
          )}

          {isOwner && (
            <>
              <ProfileOwnerPanels userId={p.id} />
              <AccountSections userId={p.id} />
            </>
          )}
        </div>

        {/* Timeline-kolom */}
        <div className="min-w-0">
          {locked ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-6 py-12 text-center">
              <div className="text-3xl">🔒</div>
              <h2 className="mt-2 text-base font-semibold text-neutral-800">
                {t("lockedTitle")}
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">
                {t("lockedBody")}
              </p>
            </div>
          ) : (
            <>
              <h2 className="mb-3 text-sm font-semibold text-neutral-700">
                {t("timeline")}
              </h2>
              <ProfileTimeline items={timelineItems} />

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
                        {c.visibility !== "public" && (
                          <span className="ml-1.5 text-xs text-neutral-400">
                            {c.visibility === "private" ? "🔒" : c.visibility === "followers" ? "👥" : "🤝"}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
