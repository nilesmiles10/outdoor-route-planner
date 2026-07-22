"use client";

// Eigen-profiel-panelen (profile-optimization plan): volgverzoeken-inbox
// (accept = update pending→accepted, weigeren = delete; beide RLS-gedekt)
// en close-friends-beheer (owner-only tabel; friend ziet de lijst niet).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import Avatar from "./Avatar";

type MiniProfile = { id: string; display_name: string | null; avatar_url: string | null };

async function fetchProfiles(sb: SupabaseClient, ids: string[]): Promise<Map<string, MiniProfile>> {
  if (ids.length === 0) return new Map();
  const { data } = await sb
    .from("profiles")
    .select("id,display_name,avatar_url")
    .in("id", ids);
  return new Map(((data as MiniProfile[]) ?? []).map((p) => [p.id, p]));
}

export default function ProfileOwnerPanels({ userId }: { userId: string }) {
  const t = useTranslations("profile");
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [requests, setRequests] = useState<MiniProfile[]>([]);
  const [friends, setFriends] = useState<MiniProfile[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; display_name: string | null }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const [{ data: pend }, { data: cf }] = await Promise.all([
      sb.from("follows").select("follower_id").eq("followee_id", userId).eq("status", "pending"),
      sb.from("close_friends").select("friend").eq("owner", userId),
    ]);
    const pendIds = ((pend as { follower_id: string }[]) ?? []).map((r) => r.follower_id);
    const cfIds = ((cf as { friend: string }[]) ?? []).map((r) => r.friend);
    const profs = await fetchProfiles(sb, [...pendIds, ...cfIds]);
    setRequests(pendIds.map((id) => profs.get(id) ?? { id, display_name: null, avatar_url: null }));
    setFriends(cfIds.map((id) => profs.get(id) ?? { id, display_name: null, avatar_url: null }));
  }, [sb, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function accept(id: string) {
    await sb
      .from("follows")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("follower_id", id)
      .eq("followee_id", userId)
      .eq("status", "pending");
    load();
  }

  async function deny(id: string) {
    await sb.from("follows").delete().eq("follower_id", id).eq("followee_id", userId);
    load();
  }

  async function addFriend(id: string) {
    await sb.from("close_friends").insert({ owner: userId, friend: id });
    setQ("");
    setHits([]);
    load();
  }

  async function removeFriend(id: string) {
    await sb.from("close_friends").delete().eq("owner", userId).eq("friend", id);
    load();
  }

  function onSearch(v: string) {
    setQ(v);
    clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const { data } = await sb.rpc("search_profiles", { q: v.trim() });
      const rows = ((data as { id: string; display_name: string | null }[]) ?? []).filter(
        (r) => r.id !== userId && !friends.some((f) => f.id === r.id),
      );
      setHits(rows);
    }, 250);
  }

  const anon = t("anonymous");

  return (
    <div className="mt-4 flex flex-col gap-3">
      {requests.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <h3 className="text-xs font-semibold text-amber-900">
            {t("requests")} ({requests.length})
          </h3>
          <div className="mt-2 flex flex-col gap-1.5">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <Avatar name={r.display_name ?? anon} url={r.avatar_url} size={22} />
                <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">
                  {r.display_name ?? anon}
                </span>
                <button
                  type="button"
                  onClick={() => accept(r.id)}
                  className="rounded-lg bg-emerald-700 px-2 py-1 font-medium text-white hover:bg-emerald-800"
                >
                  {t("accept")}
                </button>
                <button
                  type="button"
                  onClick={() => deny(r.id)}
                  className="rounded-lg bg-neutral-100 px-2 py-1 text-neutral-600 hover:bg-neutral-200"
                >
                  {t("deny")}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-3">
        <h3 className="text-xs font-semibold text-neutral-700">
          🤝 {t("closeFriends")} ({friends.length})
        </h3>
        <p className="mt-0.5 text-[10px] text-neutral-500">{t("closeFriendsHint")}</p>
        {friends.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {friends.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-xs">
                <Avatar name={f.display_name ?? anon} url={f.avatar_url} size={22} />
                <span className="min-w-0 flex-1 truncate text-neutral-800">
                  {f.display_name ?? anon}
                </span>
                <button
                  type="button"
                  onClick={() => removeFriend(f.id)}
                  className="text-neutral-300 hover:text-red-600"
                  aria-label={t("removeFriend")}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="relative mt-2">
          <input
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t("searchPeople")}
            className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-xs"
          />
          {hits.length > 0 && (
            <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
              {hits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => addFriend(h.id)}
                  className="block w-full px-2 py-1.5 text-left text-xs hover:bg-neutral-50"
                >
                  + {h.display_name ?? anon}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
