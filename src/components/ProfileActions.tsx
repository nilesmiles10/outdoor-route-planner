"use client";

// GEN-118 — client side of the public profile page: follow/unfollow,
// report/block menu, and the owner's edit panel (name, region, bio,
// sports, avatar upload).

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

const SPORTS = ["hike", "run", "touring", "gravel", "mtb", "road", "ebike"];

type Profile = {
  id: string;
  display_name: string | null;
  home_region: string | null;
  bio: string | null;
  avatar_url: string | null;
  preferred_sports: string[];
};

export default function ProfileActions({ profile }: { profile: Profile }) {
  const t = useTranslations("profile");
  const tp = useTranslations("planner");
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    display_name: profile.display_name ?? "",
    home_region: profile.home_region ?? "",
    bio: profile.bio ?? "",
    sports: profile.preferred_sports ?? [],
  });
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
  }, [sb]);

  useEffect(() => {
    if (!user || user.id === profile.id) return;
    sb.from("follows")
      .select("followee_id")
      .eq("follower_id", user.id)
      .eq("followee_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setFollowing(!!data));
    sb.from("blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setBlocked(!!data));
  }, [sb, user, profile.id]);

  const isOwn = user?.id === profile.id;

  async function toggleFollow() {
    if (!user) return;
    if (following) {
      await sb
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("followee_id", profile.id);
      setFollowing(false);
    } else {
      await sb
        .from("follows")
        .insert({ follower_id: user.id, followee_id: profile.id });
      setFollowing(true);
    }
  }

  async function toggleBlock() {
    if (!user) return;
    if (blocked) {
      await sb
        .from("blocks")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", profile.id);
      setBlocked(false);
    } else {
      await sb
        .from("blocks")
        .insert({ blocker_id: user.id, blocked_id: profile.id });
      setBlocked(true);
    }
    setMenuOpen(false);
  }

  async function report() {
    if (!user) return;
    const reason = window.prompt(t("reportPrompt"));
    if (!reason?.trim()) return;
    await sb.from("reports").insert({
      subject_type: "profile",
      subject_id: profile.id,
      reporter: user.id,
      reason: reason.trim().slice(0, 500),
    });
    setMenuOpen(false);
    alert(t("reportThanks"));
  }

  async function saveProfile() {
    if (!user) return;
    await sb
      .from("profiles")
      .update({
        display_name: form.display_name.trim() || null,
        home_region: form.home_region.trim() || null,
        bio: form.bio.trim() || null,
        preferred_sports: form.sports,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    setSaved(true);
    setTimeout(() => window.location.reload(), 400);
  }

  async function uploadAvatar(f: File) {
    if (!user) return;
    const path = `${user.id}/avatar-${Date.now()}.${f.name.split(".").pop() || "jpg"}`;
    const { error } = await sb.storage.from("avatars").upload(path, f, {
      upsert: true,
      cacheControl: "3600",
    });
    if (error) return;
    const { data } = sb.storage.from("avatars").getPublicUrl(path);
    await sb
      .from("profiles")
      .update({ avatar_url: data.publicUrl })
      .eq("id", user.id);
    window.location.reload();
  }

  if (!user) return null;

  if (isOwn) {
    return (
      <div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
          >
            ✎ {t("edit")}
          </button>
        ) : (
          <div className="mt-2 flex max-w-sm flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="self-start text-xs text-emerald-700 hover:underline"
            >
              📷 {t("changePhoto")}
            </button>
            <input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder={t("name")}
              className="rounded border border-neutral-200 px-2 py-1.5 text-sm"
            />
            <input
              value={form.home_region}
              onChange={(e) => setForm({ ...form, home_region: e.target.value })}
              placeholder={t("region")}
              className="rounded border border-neutral-200 px-2 py-1.5 text-sm"
            />
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder={t("bio")}
              rows={2}
              className="rounded border border-neutral-200 px-2 py-1.5 text-sm"
            />
            <div className="flex flex-wrap gap-1">
              {SPORTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      sports: form.sports.includes(s)
                        ? form.sports.filter((x) => x !== s)
                        : [...form.sports, s],
                    })
                  }
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    form.sports.includes(s)
                      ? "bg-emerald-700 text-white"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {tp(`sports.${s}` as never)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveProfile}
                className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
              >
                {saved ? t("saved") : t("save")}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs text-neutral-400 hover:text-neutral-600"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleFollow}
        disabled={following === null}
        className={`rounded-lg px-4 py-1.5 text-xs font-medium ${
          following
            ? "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            : "bg-emerald-700 text-white hover:bg-emerald-800"
        }`}
      >
        {following ? t("following") : t("follow")}
      </button>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          className="rounded-lg bg-neutral-100 px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-200"
        >
          …
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-40 mt-1 w-40 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              onMouseDown={report}
              className="block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
            >
              🚩 {t("report")}
            </button>
            <button
              type="button"
              onMouseDown={toggleBlock}
              className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-neutral-50"
            >
              {blocked ? t("unblock") : `⛔ ${t("block")}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
