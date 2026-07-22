"use client";

// Profiel-v2 (Komoot-model): timeline-feed op de profielpagina.
// Items komen server-side (RLS-gefilterd) binnen; hier alleen de
// like-toggle en de doorklik naar de tourpagina (comments daar).
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

export type TimelineItem = {
  id: string;
  name: string;
  kind: "planned" | "completed";
  sportLabel: string;
  dateLabel: string;
  distanceKm: string;
  ascendM: number;
  movingLabel: string | null;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
};

export default function ProfileTimeline({ items: initial }: { items: TimelineItem[] }) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState(initial);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
  }, [sb]);

  async function toggleLike(item: TimelineItem) {
    if (!user) return;
    if (item.likedByMe) {
      await sb.from("tour_likes").delete().eq("tour_id", item.id).eq("user_id", user.id);
    } else {
      await sb.from("tour_likes").insert({ tour_id: item.id, user_id: user.id });
    }
    setItems((xs) =>
      xs.map((x) =>
        x.id === item.id
          ? { ...x, likedByMe: !x.likedByMe, likeCount: x.likeCount + (x.likedByMe ? -1 : 1) }
          : x,
      ),
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-neutral-400">{t("noActivity")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((it) => (
        <article key={it.id} className="rounded-xl border border-neutral-100 bg-white p-3 shadow-sm">
          <div className="text-xs text-neutral-500">
            {it.kind === "completed" ? t("verbCompleted") : t("verbPlanned")} ·{" "}
            {it.dateLabel}
          </div>
          <a
            href={`/${locale}/tour/${it.id}`}
            className="mt-1.5 block rounded-lg bg-neutral-50 px-3 py-2 hover:bg-neutral-100"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
              {it.kind === "completed" && <span aria-hidden>🏁</span>}
              <span className="truncate">{it.name}</span>
            </div>
            <div className="text-xs text-neutral-500">
              {it.distanceKm} km · ↗ {it.ascendM} m · {it.sportLabel}
              {it.movingLabel ? ` · ${it.movingLabel} h` : ""}
            </div>
          </a>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => toggleLike(it)}
              disabled={!user}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 ${
                it.likedByMe
                  ? "bg-red-50 text-red-600"
                  : "bg-neutral-100 text-neutral-600 enabled:hover:bg-neutral-200"
              } disabled:opacity-60`}
            >
              {it.likedByMe ? "❤️" : "🤍"} {it.likeCount}
            </button>
            <a href={`/${locale}/tour/${it.id}`} className="text-neutral-500 hover:text-emerald-800">
              💬 {it.commentCount}
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}
