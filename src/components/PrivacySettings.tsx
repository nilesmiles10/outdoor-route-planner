"use client";

// Privacy-sectie in AccountPanel (profile-optimization plan): profiel
// Public/Private, zoek-opt-out en default-visibility per content-type
// (routes+activiteiten apart van collecties — Komoot-split).
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import VisibilitySelect from "./VisibilitySelect";
import type { Visibility } from "@/lib/visibility";

type PrivacyRow = {
  privacy: "public" | "private";
  search_opt_out: boolean;
  default_tour_visibility: Visibility;
  default_collection_visibility: Visibility;
};

export default function PrivacySettings({ userId }: { userId: string }) {
  const t = useTranslations("account.privacy");
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [row, setRow] = useState<PrivacyRow | null>(null);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    sb.from("profiles")
      .select("privacy,search_opt_out,default_tour_visibility,default_collection_visibility")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => setRow(data as PrivacyRow | null));
  }, [sb, userId]);

  async function save(patch: Partial<PrivacyRow>) {
    if (!row) return;
    const next = { ...row, ...patch };
    setRow(next);
    const { error } = await sb.from("profiles").update(patch).eq("id", userId);
    if (!error) {
      setFlash(true);
      setTimeout(() => setFlash(false), 1200);
    }
  }

  if (!row) return null;

  return (
    <div className="border-t border-neutral-200 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-neutral-600 hover:text-neutral-900"
      >
        🛡 {t("title")} {open ? "▴" : "▾"}
        {flash && <span className="ml-2 text-emerald-700">{t("saved")}</span>}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2.5 text-xs">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={row.privacy === "private"}
              onChange={(e) => save({ privacy: e.target.checked ? "private" : "public" })}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-neutral-700">{t("privateProfile")}</span>
              <span className="block text-[10px] text-neutral-500">
                {t("privateProfileHint")}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={row.search_opt_out}
              onChange={(e) => save({ search_opt_out: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-neutral-700">{t("searchOptOut")}</span>
              <span className="block text-[10px] text-neutral-500">
                {t("searchOptOutHint")}
              </span>
            </span>
          </label>
          <div className="flex items-center justify-between gap-2">
            <span className="text-neutral-600">{t("defaultTour")}</span>
            <VisibilitySelect
              value={row.default_tour_visibility}
              onChange={(v) => save({ default_tour_visibility: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-neutral-600">{t("defaultCollection")}</span>
            <VisibilitySelect
              value={row.default_collection_visibility}
              onChange={(v) => save({ default_collection_visibility: v })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
