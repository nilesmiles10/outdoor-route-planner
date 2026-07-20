"use client";

// GEN-118 — likes and comments under a tour page. Self-contained client
// block: fetches its own data, works logged-out (read-only + login hint).
// Blocked users' comments are filtered client-side from the viewer's
// blocks list.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import Avatar from "./Avatar";

type Comment = {
  id: string;
  author: string;
  body: string;
  created_at: string;
  profile?: { display_name: string | null; avatar_url: string | null };
};

export default function TourSocial({
  tourId,
  tourOwner,
}: {
  tourId: string;
  tourOwner: string;
}) {
  const t = useTranslations("social");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null);
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [likesQ, commentsQ] = await Promise.all([
      sb.from("tour_likes").select("user_id").eq("tour_id", tourId),
      sb
        .from("tour_comments")
        .select("id,author,body,created_at,profile:profiles(display_name,avatar_url)")
        .eq("tour_id", tourId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(100),
    ]);
    const likeRows = (likesQ.data as { user_id: string }[]) ?? [];
    setLikes(likeRows.length);
    const { data: u } = await sb.auth.getUser();
    setUser(u.user);
    setLiked(!!u.user && likeRows.some((l) => l.user_id === u.user!.id));
    // supabase-js types to-one embeds as arrays — cast through unknown
    setComments(((commentsQ.data ?? []) as unknown as Comment[]));
    if (u.user) {
      const { data: blocks } = await sb
        .from("blocks")
        .select("blocked_id")
        .eq("blocker_id", u.user.id);
      setBlockedIds(new Set((blocks ?? []).map((b) => b.blocked_id as string)));
    }
  }, [sb, tourId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggleLike() {
    if (!user) return;
    if (liked) {
      await sb.from("tour_likes").delete().eq("tour_id", tourId).eq("user_id", user.id);
      setLiked(false);
      setLikes((n) => n - 1);
    } else {
      await sb.from("tour_likes").insert({ tour_id: tourId, user_id: user.id });
      setLiked(true);
      setLikes((n) => n + 1);
    }
  }

  async function post() {
    if (!user || !draft.trim()) return;
    setBusy(true);
    await sb.from("tour_comments").insert({
      tour_id: tourId,
      author: user.id,
      body: draft.trim().slice(0, 2000),
    });
    setDraft("");
    setBusy(false);
    refresh();
  }

  async function softDelete(id: string) {
    await sb
      .from("tour_comments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    refresh();
  }

  async function reportComment(id: string) {
    if (!user) return;
    const reason = window.prompt(t("reportPrompt"));
    if (!reason?.trim()) return;
    await sb.from("reports").insert({
      subject_type: "comment",
      subject_id: id,
      reporter: user.id,
      reason: reason.trim().slice(0, 500),
    });
    alert(t("reportThanks"));
  }

  const visible = comments.filter((c) => !blockedIds.has(c.author));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleLike}
          disabled={!user}
          title={!user ? t("loginToLike") : undefined}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
            liked
              ? "bg-red-50 text-red-600"
              : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
          } disabled:opacity-60`}
        >
          {liked ? "❤️" : "🤍"} {likes}
        </button>
        <span className="text-xs text-neutral-500">
          💬 {visible.length}
        </span>
      </div>

      {visible.map((c) => (
        <div key={c.id} className="flex gap-2 rounded-lg bg-neutral-50 px-2 py-1.5">
          <a href={`/${locale}/user/${c.author}`} className="mt-0.5 shrink-0">
            <Avatar
              name={c.profile?.display_name ?? null}
              url={c.profile?.avatar_url ?? null}
              size={22}
            />
          </a>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <a
                href={`/${locale}/user/${c.author}`}
                className="text-xs font-medium text-neutral-800 hover:underline"
              >
                {c.profile?.display_name ?? t("anonymous")}
              </a>
              <span className="text-[10px] text-neutral-400">
                {new Date(c.created_at).toLocaleDateString(locale)}
              </span>
              {user && (user.id === c.author || user.id === tourOwner) && (
                <button
                  type="button"
                  onClick={() => softDelete(c.id)}
                  className="text-[10px] text-neutral-300 hover:text-red-600"
                >
                  ×
                </button>
              )}
              {user && user.id !== c.author && (
                <button
                  type="button"
                  onClick={() => reportComment(c.id)}
                  className="text-[10px] text-neutral-300 hover:text-neutral-500"
                  title={t("report")}
                >
                  🚩
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap text-xs text-neutral-700">{c.body}</p>
          </div>
        </div>
      ))}

      {user ? (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") post();
            }}
            placeholder={t("commentPlaceholder")}
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={post}
            disabled={busy || !draft.trim()}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {t("post")}
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-neutral-400">{t("loginToComment")}</p>
      )}
    </div>
  );
}
