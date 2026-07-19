"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

// Bookmark ("follow") a public collection. Bookmarks are private to each user
// (RLS: user_id = auth.uid()). Anonymous visitors are nudged to the login page.
export default function BookmarkButton({ collectionId }: { collectionId: string }) {
  const t = useTranslations("collections");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null);
  const [marked, setMarked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!user) {
      setMarked(false);
      return;
    }
    sb.from("collection_bookmarks")
      .select("collection_id")
      .eq("collection_id", collectionId)
      .maybeSingle()
      .then(({ data }) => setMarked(!!data));
  }, [sb, user, collectionId]);

  if (!user) {
    return (
      <a
        href={`/${locale}/routes`}
        className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
      >
        ☆ {t("bookmark")}
      </a>
    );
  }

  async function toggle() {
    if (busy || !user) return;
    setBusy(true);
    if (marked) {
      await sb
        .from("collection_bookmarks")
        .delete()
        .eq("collection_id", collectionId);
      setMarked(false);
    } else {
      await sb
        .from("collection_bookmarks")
        .insert({ collection_id: collectionId, user_id: user.id });
      setMarked(true);
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
        marked
          ? "bg-emerald-700 text-white hover:bg-emerald-800"
          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
      }`}
    >
      {marked ? `★ ${t("bookmarked")}` : `☆ ${t("bookmark")}`}
    </button>
  );
}
