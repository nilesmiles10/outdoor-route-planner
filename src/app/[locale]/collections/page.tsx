"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { aggregateStats, gradientFor, SPORT_EMOJI } from "@/lib/collections";

type ItemTour = { tours: { sport: string; stats: { distanceM?: number; ascendM?: number } } | null };
type Coll = {
  id: string;
  title: string;
  intro: string | null;
  owner: string;
  visibility: "private" | "public";
  collection_items: ItemTour[];
};

const SELECT =
  "id,title,intro,owner,visibility,collection_items(tours(sport,stats))";

function CollectionCard({ c, locale }: { c: Coll; locale: string }) {
  const tours = c.collection_items.map((i) => i.tours).filter(Boolean) as {
    sport: string;
    stats: { distanceM?: number; ascendM?: number };
  }[];
  const agg = aggregateStats(tours.map((t) => t.stats));
  const sport = tours[0]?.sport;
  return (
    <a
      href={`/${locale}/collection/${c.id}`}
      className="group overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-sm transition hover:shadow-md"
    >
      <div
        className={`relative flex h-28 items-center justify-center bg-gradient-to-br ${gradientFor(sport)}`}
      >
        <span className="text-4xl opacity-90 drop-shadow">
          {(sport && SPORT_EMOJI[sport]) || "🗺️"}
        </span>
        {c.visibility === "private" && (
          <span className="absolute right-2 top-2 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white">
            🔒
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="font-medium text-neutral-900 group-hover:text-emerald-800">
          {c.title}
        </div>
        <div className="mt-1 text-xs text-neutral-500">
          {tours.length} {tours.length === 1 ? "route" : "routes"} ·{" "}
          {(agg.distanceM / 1000).toFixed(0)} km · ↗ {Math.round(agg.ascendM)} m
        </div>
        {c.intro && (
          <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{c.intro}</p>
        )}
      </div>
    </a>
  );
}

export default function CollectionsPage() {
  const t = useTranslations("collections");
  const locale = useLocale();
  const router = useRouter();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null);
  const [publicColls, setPublicColls] = useState<Coll[]>([]);
  const [mine, setMine] = useState<Coll[]>([]);
  const [bookmarked, setBookmarked] = useState<Coll[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  const load = useCallback(async () => {
    const pub = await sb
      .from("collections")
      .select(SELECT)
      .eq("visibility", "public")
      .order("updated_at", { ascending: false })
      .limit(60);
    setPublicColls((pub.data as unknown as Coll[]) ?? []);
    if (user) {
      const own = await sb
        .from("collections")
        .select(SELECT)
        .eq("owner", user.id)
        .order("updated_at", { ascending: false });
      setMine((own.data as unknown as Coll[]) ?? []);
      const bm = await sb
        .from("collection_bookmarks")
        .select(`collections(${SELECT})`)
        .order("created_at", { ascending: false });
      setBookmarked(
        ((bm.data as unknown as { collections: Coll | null }[]) ?? [])
          .map((r) => r.collections)
          .filter(Boolean) as Coll[],
      );
    } else {
      setMine([]);
      setBookmarked([]);
    }
  }, [sb, user]);

  useEffect(() => {
    load();
  }, [load]);

  async function createNew() {
    if (!user) {
      router.push(`/${locale}/routes`);
      return;
    }
    setCreating(true);
    const { data, error } = await sb
      .from("collections")
      .insert({ owner: user.id, title: t("untitled") })
      .select("id")
      .single();
    setCreating(false);
    if (!error && data) router.push(`/${locale}/collection/${data.id}/edit`);
  }

  const ownedIds = new Set(mine.map((c) => c.id));
  const bookmarkedNotOwn = bookmarked.filter((c) => !ownedIds.has(c.id));

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 pb-16 pt-20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-neutral-500">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={createNew}
          disabled={creating}
          className="shrink-0 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          + {t("new")}
        </button>
      </div>

      {mine.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {t("mine")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((c) => (
              <CollectionCard key={c.id} c={c} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {bookmarkedNotOwn.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {t("bookmarkedTab")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bookmarkedNotOwn.map((c) => (
              <CollectionCard key={c.id} c={c} locale={locale} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          {t("explore")}
        </h2>
        {publicColls.length === 0 ? (
          <p className="text-sm text-neutral-400">{t("empty")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {publicColls.map((c) => (
              <CollectionCard key={c.id} c={c} locale={locale} />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-16 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
        © {new Date().getFullYear()} Outdoor Route Planner ·{" "}
        <a href="https://www.openstreetmap.org/copyright" className="hover:underline">
          © OpenStreetMap contributors
        </a>
      </footer>
    </main>
  );
}
