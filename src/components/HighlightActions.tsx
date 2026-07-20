"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

const SPORTS = ["hike", "run", "touring", "gravel", "mtb", "road", "ebike"] as const;

// Contribution island for the highlight page (GEN-138): per-sport recommend
// vote, add a tip, upload a photo. Anonymous visitors get a login nudge.
export default function HighlightActions({ highlightId }: { highlightId: string }) {
  const t = useTranslations("highlightPage");
  const ts = useTranslations("planner.sports");
  const locale = useLocale();
  const router = useRouter();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null);
  const [sport, setSport] = useState<string>("hike");
  const [myVote, setMyVote] = useState<0 | 1 | -1>(0);
  const [tipText, setTipText] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!user) return;
    sb.from("highlight_votes")
      .select("value,sport")
      .eq("highlight_id", highlightId)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setMyVote(data.value as 1 | -1);
          if (data.sport) setSport(data.sport);
        }
      });
  }, [sb, user, highlightId]);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2000);
  }

  async function vote(value: 1 | -1) {
    if (!user) return;
    if (myVote === value) {
      await sb
        .from("highlight_votes")
        .delete()
        .eq("highlight_id", highlightId)
        .eq("user_id", user.id);
      setMyVote(0);
    } else {
      await sb.from("highlight_votes").upsert(
        { user_id: user.id, highlight_id: highlightId, value, sport },
        { onConflict: "user_id,highlight_id" },
      );
      setMyVote(value);
    }
    router.refresh();
  }

  async function addTip() {
    if (!user || tipText.trim().length < 3) return;
    setBusy(true);
    const { error } = await sb.from("highlight_tips").insert({
      highlight_id: highlightId,
      author: user.id,
      sport,
      text: tipText.trim(),
    });
    setBusy(false);
    if (!error) {
      setTipText("");
      showFlash(t("tipAdded"));
      router.refresh();
    }
  }

  async function uploadPhoto(file: File) {
    if (!user) return;
    setBusy(true);
    const path = `${user.id}/${highlightId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error: upErr } = await sb.storage
      .from("highlight-photos")
      .upload(path, file, { cacheControl: "31536000" });
    if (!upErr) {
      await sb.from("highlight_photos").insert({
        highlight_id: highlightId,
        owner: user.id,
        path,
      });
      showFlash(t("photoAdded"));
      router.refresh();
    }
    setBusy(false);
  }

  if (!user) {
    return (
      <div className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">
        {t("loginToContribute")}{" "}
        <a href={`/${locale}/routes`} className="text-emerald-700 hover:underline">
          {t("login")} →
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-neutral-900">
        {t("recommendTitle")}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {SPORTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSport(s)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              sport === s
                ? "bg-emerald-700 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {ts(s as never)}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => vote(1)}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            myVote === 1
              ? "bg-emerald-100 text-emerald-800"
              : "bg-neutral-100 hover:bg-neutral-200"
          }`}
        >
          👍 {t("recommend")}
        </button>
        <button
          type="button"
          onClick={() => vote(-1)}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            myVote === -1
              ? "bg-red-100 text-red-800"
              : "bg-neutral-100 hover:bg-neutral-200"
          }`}
        >
          👎
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="ml-auto rounded-lg bg-neutral-100 px-3 py-1.5 text-sm hover:bg-neutral-200 disabled:opacity-50"
        >
          📷 {t("addPhoto")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadPhoto(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={tipText}
          onChange={(e) => setTipText(e.target.value)}
          placeholder={t("tipPlaceholder")}
          maxLength={1000}
          className="w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={addTip}
          disabled={busy || tipText.trim().length < 3}
          className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {t("addTip")}
        </button>
      </div>
      {flash && <p className="mt-2 text-xs text-emerald-700">{flash}</p>}
    </div>
  );
}
