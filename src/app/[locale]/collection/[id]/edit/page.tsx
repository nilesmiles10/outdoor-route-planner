"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { SPORT_EMOJI } from "@/lib/collections";
import VisibilitySelect from "@/components/VisibilitySelect";
import type { Visibility } from "@/lib/visibility";

type MyTour = {
  id: string;
  name: string;
  sport: string;
  stats: { distanceM: number; ascendM: number };
};
type Item = { tour_id: string; note: string; position: number; tour: MyTour | null };
type Coll = {
  id: string;
  owner: string;
  title: string;
  intro: string | null;
  visibility: Visibility;
};

export default function EditCollectionPage({
  params,
}: {
  params: { id: string };
}) {
  const t = useTranslations("collections");
  const locale = useLocale();
  const router = useRouter();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const collId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [coll, setColl] = useState<Coll | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [myTours, setMyTours] = useState<MyTour[]>([]);
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [flash, setFlash] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setChecked(true);
    });
  }, [sb]);

  const load = useCallback(async () => {
    const { data: c } = await sb
      .from("collections")
      .select("id,owner,title,intro,visibility")
      .eq("id", collId)
      .maybeSingle();
    if (!c) {
      setColl(null);
      return;
    }
    setColl(c as Coll);
    setTitle((c as Coll).title);
    setIntro((c as Coll).intro ?? "");
    setVisibility((c as Coll).visibility);

    const { data: rows } = await sb
      .from("collection_items")
      .select("tour_id,note,position,tours(id,name,sport,stats)")
      .eq("collection_id", collId)
      .order("position", { ascending: true });
    setItems(
      ((rows as unknown as { tour_id: string; note: string | null; position: number; tours: MyTour | null }[]) ?? []).map(
        (r) => ({ tour_id: r.tour_id, note: r.note ?? "", position: r.position, tour: r.tours }),
      ),
    );

    const { data: mine } = await sb
      .from("tours")
      .select("id,name,sport,stats")
      .order("updated_at", { ascending: false });
    setMyTours((mine as MyTour[]) ?? []);
  }, [sb, collId]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 1500);
  }

  async function saveMeta() {
    if (!coll) return;
    const { error } = await sb
      .from("collections")
      .update({ title: title.trim() || t("untitled"), intro: intro.trim() || null, visibility })
      .eq("id", coll.id);
    if (!error) showFlash(t("saved"));
  }

  // Persist the current ordered item list (positions = array index). Used after
  // add / remove / reorder so positions stay a gapless 0..n sequence.
  const persistOrder = useCallback(
    async (next: Item[]) => {
      const rows = next.map((it, i) => ({
        collection_id: collId,
        tour_id: it.tour_id,
        position: i,
        note: it.note || null,
      }));
      if (rows.length)
        await sb.from("collection_items").upsert(rows, { onConflict: "collection_id,tour_id" });
    },
    [sb, collId],
  );

  async function addTour(tr: MyTour) {
    if (items.some((i) => i.tour_id === tr.id)) return;
    const next = [...items, { tour_id: tr.id, note: "", position: items.length, tour: tr }];
    setItems(next);
    await persistOrder(next);
  }

  async function removeItem(tourId: string) {
    const next = items.filter((i) => i.tour_id !== tourId);
    setItems(next);
    await sb
      .from("collection_items")
      .delete()
      .eq("collection_id", collId)
      .eq("tour_id", tourId);
    await persistOrder(next);
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    setItems(next);
    await persistOrder(next);
  }

  async function saveNote(tourId: string, note: string) {
    setItems((prev) => prev.map((i) => (i.tour_id === tourId ? { ...i, note } : i)));
    await sb
      .from("collection_items")
      .update({ note: note || null })
      .eq("collection_id", collId)
      .eq("tour_id", tourId);
  }

  async function deleteCollection() {
    if (!coll || !confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    await sb.from("collections").delete().eq("id", coll.id);
    router.push(`/${locale}/collections`);
  }

  if (!checked) return null;
  if (!user)
    return (
      <main className="mx-auto min-h-dvh max-w-2xl px-4 pt-24">
        <p className="text-sm text-neutral-600">
          {t("needLogin")}{" "}
          <a href={`/${locale}/routes`} className="text-emerald-700 hover:underline">
            {t("login")} →
          </a>
        </p>
      </main>
    );
  if (user && checked && coll === null)
    return (
      <main className="mx-auto min-h-dvh max-w-2xl px-4 pt-24">
        <p className="text-sm text-neutral-600">{t("notFound")}</p>
      </main>
    );

  const usedIds = new Set(items.map((i) => i.tour_id));
  const addable = myTours.filter((t) => !usedIds.has(t.id));

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 pb-16 pt-20">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">{t("editTitle")}</h1>
        <a
          href={`/${locale}/collection/${collId}`}
          className="text-xs text-emerald-700 hover:underline"
        >
          {t("viewPage")} ↗
        </a>
      </div>

      {/* Meta */}
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-neutral-100 bg-white p-4 shadow-sm">
        <label className="text-xs font-medium text-neutral-600">
          {t("titleLabel")}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-neutral-600">
          {t("introLabel")}
          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={3}
            placeholder={t("introPlaceholder")}
            className="mt-1 w-full resize-y rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center gap-3">
          <VisibilitySelect value={visibility} onChange={setVisibility} />
          <button
            type="button"
            onClick={saveMeta}
            className="rounded-lg bg-emerald-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
          >
            {t("save")}
          </button>
          {flash && <span className="text-xs text-emerald-700">{flash}</span>}
        </div>
      </div>

      {/* Items */}
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        {t("routesInCollection")}
      </h2>
      <ol className="mt-3 flex flex-col gap-2">
        {items.length === 0 && (
          <p className="text-sm text-neutral-400">{t("noRoutesYet")}</p>
        )}
        {items.map((it, i) => (
          <li
            key={it.tour_id}
            className="flex gap-2 rounded-xl border border-neutral-100 bg-white p-3 shadow-sm"
          >
            <div className="flex flex-col items-center gap-1 pt-1">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="text-neutral-400 hover:text-emerald-700 disabled:opacity-20"
                aria-label={t("moveUp")}
              >
                ▲
              </button>
              <span className="text-[10px] text-neutral-400">{i + 1}</span>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                className="text-neutral-400 hover:text-emerald-700 disabled:opacity-20"
                aria-label={t("moveDown")}
              >
                ▼
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-neutral-900">
                  {it.tour ? (
                    <>
                      {SPORT_EMOJI[it.tour.sport] ?? ""} {it.tour.name}
                    </>
                  ) : (
                    it.tour_id
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(it.tour_id)}
                  className="shrink-0 text-neutral-300 hover:text-red-600"
                  aria-label={t("remove")}
                >
                  ×
                </button>
              </div>
              {it.tour && (
                <div className="text-xs text-neutral-500">
                  {(it.tour.stats.distanceM / 1000).toFixed(1)} km · ↗{" "}
                  {it.tour.stats.ascendM} m
                </div>
              )}
              <textarea
                defaultValue={it.note}
                onBlur={(e) => saveNote(it.tour_id, e.target.value.trim())}
                rows={2}
                placeholder={t("notePlaceholder")}
                className="mt-2 w-full resize-y rounded-lg border border-neutral-200 px-2 py-1 text-xs"
              />
            </div>
          </li>
        ))}
      </ol>

      {/* Add tour */}
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        {t("addRoutes")}
      </h2>
      {addable.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">{t("noMoreTours")}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1">
          {addable.map((tr) => (
            <button
              key={tr.id}
              type="button"
              onClick={() => addTour(tr)}
              className="flex items-center justify-between gap-2 rounded-lg border border-neutral-100 bg-white px-3 py-2 text-left text-sm shadow-sm hover:border-emerald-300"
            >
              <span className="truncate">
                {SPORT_EMOJI[tr.sport] ?? ""} {tr.name}
                <span className="ml-2 text-xs text-neutral-400">
                  {(tr.stats.distanceM / 1000).toFixed(0)} km
                </span>
              </span>
              <span className="shrink-0 text-emerald-700">+ {t("add")}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-10 border-t border-neutral-100 pt-4">
        <button
          type="button"
          onClick={deleteCollection}
          disabled={deleting}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
        >
          {t("deleteCollection")}
        </button>
      </div>
    </main>
  );
}
