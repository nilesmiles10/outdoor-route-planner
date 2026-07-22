"use client";

// GEN-118 — chronological feed of public routes and completed activities
// from people you follow. Deliberately a separate page: the planner stays
// the homepage (unlike Komoot, which swaps its homepage for the feed).

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtDuration } from "@/lib/activity";
import Avatar from "@/components/Avatar";
import AccountPanel from "@/components/AccountPanel";
import SiteFooter from "@/components/SiteFooter";

type Item = {
  id: string;
  owner: string;
  name: string;
  sport: string;
  kind: "planned" | "completed";
  recorded_at: string | null;
  moving_s: number | null;
  stats: { distanceM: number; ascendM: number };
  created_at: string;
  profile: { display_name: string | null; avatar_url: string | null } | null;
  likeCount: number;
  likedByMe: boolean;
};

export default function FeedPage() {
  const t = useTranslations("feed");
  const tp = useTranslations("planner");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [items, setItems] = useState<Item[]>([]);
  const [followCount, setFollowCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!user) {
      if (user === null) setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const [{ data: follows }, { data: blocks }] = await Promise.all([
        sb
          .from("follows")
          .select("followee_id")
          .eq("follower_id", user.id)
          .eq("status", "accepted"),
        sb.from("blocks").select("blocked_id").eq("blocker_id", user.id),
      ]);
      const followees = (follows ?? []).map((f) => f.followee_id as string);
      const blocked = new Set((blocks ?? []).map((b) => b.blocked_id as string));
      setFollowCount(followees.length);
      const targets = followees.filter((id) => !blocked.has(id));
      if (targets.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }
      const { data: tours } = await sb
        .from("tours")
        .select(
          "id,owner,name,sport,kind,recorded_at,moving_s,stats,created_at,profile:profiles!tours_owner_profiles_fkey(display_name,avatar_url)",
        )
        .in("owner", targets)
        // Geen visibility-filter: RLS (can_view_content) geeft van followees
        // ook followers-/close-friends-tier terug, private nooit.
        .neq("visibility", "private")
        .order("created_at", { ascending: false })
        .limit(30);
      const rows = ((tours ?? []) as unknown as Omit<Item, "likeCount" | "likedByMe">[]);
      const ids = rows.map((r) => r.id);
      const { data: likes } = ids.length
        ? await sb.from("tour_likes").select("tour_id,user_id").in("tour_id", ids)
        : { data: [] };
      const likeRows = (likes ?? []) as { tour_id: string; user_id: string }[];
      setItems(
        rows.map((r) => ({
          ...r,
          likeCount: likeRows.filter((l) => l.tour_id === r.id).length,
          likedByMe: likeRows.some((l) => l.tour_id === r.id && l.user_id === user.id),
        })),
      );
      setLoading(false);
    })();
  }, [sb, user]);

  async function toggleLike(item: Item) {
    if (!user) return;
    if (item.likedByMe) {
      await sb.from("tour_likes").delete().eq("tour_id", item.id).eq("user_id", user.id);
    } else {
      await sb.from("tour_likes").insert({ tour_id: item.id, user_id: user.id });
    }
    setItems((xs) =>
      xs.map((x) =>
        x.id === item.id
          ? {
              ...x,
              likedByMe: !x.likedByMe,
              likeCount: x.likeCount + (x.likedByMe ? -1 : 1),
            }
          : x,
      ),
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 pb-16 pt-20">
      <h1 className="text-xl font-semibold text-neutral-900">{t("title")}</h1>
      {user === null && (
        <div className="mt-6 max-w-sm">
          <p className="mb-3 text-sm text-neutral-600">{t("needLogin")}</p>
          <AccountPanel tour={null} onLoadTour={() => {}} />
        </div>
      )}
      {user && !loading && followCount === 0 && (
        <p className="mt-6 text-sm text-neutral-500">{t("emptyNoFollows")}</p>
      )}
      {user && !loading && followCount > 0 && items.length === 0 && (
        <p className="mt-6 text-sm text-neutral-500">{t("emptyQuiet")}</p>
      )}
      <div className="mt-4 flex flex-col gap-3">
        {items.map((it) => {
          const completed = it.kind === "completed";
          const name = it.profile?.display_name ?? t("anonymous");
          return (
            <article
              key={it.id}
              className="rounded-xl border border-neutral-100 bg-white p-3 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <a href={`/${locale}/user/${it.owner}`}>
                  <Avatar name={name} url={it.profile?.avatar_url ?? null} size={30} />
                </a>
                <div className="min-w-0 flex-1 text-xs text-neutral-600">
                  <a
                    href={`/${locale}/user/${it.owner}`}
                    className="font-medium text-neutral-900 hover:underline"
                  >
                    {name}
                  </a>{" "}
                  {completed ? t("verbCompleted") : t("verbPlanned")}
                  <span className="ml-1 text-neutral-400">
                    ·{" "}
                    {new Date(
                      completed && it.recorded_at ? it.recorded_at : it.created_at,
                    ).toLocaleDateString(locale)}
                  </span>
                </div>
              </div>
              <a href={`/${locale}/tour/${it.id}`} className="mt-2 block rounded-lg bg-neutral-50 px-3 py-2 hover:bg-neutral-100">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                  {completed && <span aria-hidden>🏁</span>}
                  <span className="truncate">{it.name}</span>
                </div>
                <div className="text-xs text-neutral-500">
                  {(it.stats.distanceM / 1000).toFixed(1)} km · ↗ {it.stats.ascendM} m ·{" "}
                  {tp(`sports.${it.sport}` as never)}
                  {completed && it.moving_s ? ` · ${fmtDuration(it.moving_s)} h` : ""}
                </div>
              </a>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleLike(it)}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${
                    it.likedByMe ? "bg-red-50 text-red-600" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {it.likedByMe ? "❤️" : "🤍"} {it.likeCount}
                </button>
                <a
                  href={`/${locale}/tour/${it.id}`}
                  className="text-xs text-neutral-500 hover:text-emerald-800"
                >
                  💬 {t("comment")}
                </a>
              </div>
            </article>
          );
        })}
      </div>
      <SiteFooter />
    </main>
  );
}
