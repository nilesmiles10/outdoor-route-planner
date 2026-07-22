"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import VisibilitySelect from "./VisibilitySelect";
import type { Visibility } from "@/lib/visibility";
import type { Waypoint } from "./MapView";

export type TourPayload = {
  name: string;
  sport: string;
  waypoints: Waypoint[];
  geometry: unknown;
  elevation: number[];
  stats: unknown;
  surfaces: unknown;
  waytypes: unknown;
};

type TourRow = {
  id: string;
  name: string;
  sport: string;
  visibility: Visibility;
  stats: { distanceM: number };
  updated_at: string;
};

type Props = {
  tour: TourPayload | null;
  onLoadTour: (waypoints: Waypoint[], sport: string) => void;
  // Planner passes true: login lives in the header / routes page there.
  hideLoginForm?: boolean;
};

export default function AccountPanel({ tour, onLoadTour, hideLoginForm }: Props) {
  const t = useTranslations("account");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [phase, setPhase] = useState<"idle" | "code" | "mfa" | "busy">("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const [tours, setTours] = useState<TourRow[]>([]);
  const [open, setOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // 2FA step-up: users with a verified TOTP factor sit at aal1 after the
  // first factor and must verify a code to reach aal2.
  const needsMfa = useCallback(async (): Promise<boolean> => {
    const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
  }, [sb]);

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      // Reload mid step-up: re-show the code prompt.
      if (data.user && (await needsMfa())) setPhase("mfa");
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [sb, needsMfa]);

  const refreshTours = useCallback(async () => {
    const { data } = await sb
      .from("tours")
      .select("id,name,sport,visibility,stats,updated_at")
      .order("updated_at", { ascending: false })
      .limit(25);
    setTours((data as TourRow[]) ?? []);
  }, [sb]);

  useEffect(() => {
    if (user && open) refreshTours();
  }, [user, open, refreshTours]);

  async function sendCode() {
    setPhase("busy");
    setAuthError(null);
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      setAuthError(error.message);
      setPhase("idle");
    } else {
      setPhase("code");
    }
  }

  async function loginWithPassword() {
    setPhase("busy");
    setAuthError(null);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    if (!error) {
      setPassword("");
      setPhase((await needsMfa()) ? "mfa" : "idle");
    } else {
      setPhase("idle");
    }
  }

  async function verifyCode() {
    setPhase("busy");
    setAuthError(null);
    const { error } = await sb.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setAuthError(error.message);
      setPhase("code");
    } else {
      setCode("");
      setPhase((await needsMfa()) ? "mfa" : "idle");
    }
  }

  async function verifyMfa() {
    setAuthError(null);
    const { data: factors } = await sb.auth.mfa.listFactors();
    const factorId = factors?.totp?.[0]?.id;
    if (!factorId) {
      setPhase("idle");
      return;
    }
    const { error } = await sb.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    if (error) {
      setAuthError(t("mfa.wrongCode"));
    } else {
      setCode("");
      setPhase("idle");
    }
  }

  async function saveTour() {
    if (!tour || !user) return;
    const { error } = await sb.from("tours").insert({
      owner: user.id,
      ...tour,
    });
    if (!error) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      if (open) refreshTours();
    }
  }

  async function loadTour(id: string) {
    const { data } = await sb
      .from("tours")
      .select("waypoints,sport")
      .eq("id", id)
      .single();
    if (data) onLoadTour(data.waypoints as Waypoint[], data.sport);
  }

  async function deleteTour(id: string) {
    await sb.from("tours").delete().eq("id", id);
    refreshTours();
  }

  async function setVisibility(row: TourRow, v: Visibility) {
    await sb.from("tours").update({ visibility: v }).eq("id", row.id);
    refreshTours();
  }

  if (!user) {
    if (hideLoginForm) {
      return (
        <a
          href={`/${locale}/routes`}
          className="text-xs text-emerald-700 hover:underline"
        >
          {t("login")} →
        </a>
      );
    }
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3">
        <div className="text-xs font-medium text-neutral-700">{t("login")}</div>
        {phase !== "code" ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                placeholder={t("email")}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
              />
              {!usePassword && (
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={phase === "busy" || !email.includes("@")}
                  className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
                >
                  {t("sendCode")}
                </button>
              )}
            </div>
            {usePassword && (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={password}
                  placeholder={t("password")}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={loginWithPassword}
                  disabled={phase === "busy" || !email.includes("@") || !password}
                  className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
                >
                  {t("loginBtn")}
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setUsePassword((v) => !v)}
                className="text-[10px] text-emerald-700 hover:underline"
              >
                {usePassword ? t("useCode") : t("usePassword")}
              </button>
              <a
                href={`/${locale}/reset-password`}
                className="text-[10px] text-neutral-400 hover:text-neutral-600 hover:underline"
              >
                {t("forgotPassword")}
              </a>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={code}
              placeholder={t("codePlaceholder")}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={verifyCode}
              disabled={code.trim().length < 6}
              className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              {t("verify")}
            </button>
          </div>
        )}
        {phase === "code" && (
          <p className="text-[10px] text-neutral-500">{t("codeSent")}</p>
        )}
        {authError && <p className="text-[10px] text-red-600">{authError}</p>}
      </div>
    );
  }

  // Priority branch: onAuthStateChange sets `user` at aal1 already, so the
  // step-up prompt must win over the logged-in view.
  if (phase === "mfa") {
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3">
        <p className="text-xs font-medium text-neutral-700">🔐 {t("mfa.stepUpTitle")}</p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.trim().length === 6) verifyMfa();
            }}
            className="w-24 rounded-lg border border-neutral-200 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={verifyMfa}
            disabled={code.trim().length !== 6}
            className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            {t("verify")}
          </button>
          <button
            type="button"
            onClick={() => {
              sb.auth.signOut();
              setPhase("idle");
              setCode("");
            }}
            className="text-[10px] text-neutral-400 hover:text-neutral-600"
          >
            {t("logout")}
          </button>
        </div>
        {authError && <p className="text-[10px] text-red-600">{authError}</p>}
      </div>
    );
  }

  // Accountbeheer (uitloggen, 2FA, privacy, account verwijderen) zit in
  // de header-dropdown en op de eigen profielpagina — dit paneel gaat
  // alleen nog over routes opslaan en laden.
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={saveTour}
          disabled={!tour}
          className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          {savedFlash ? t("saved") : t("save")}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-emerald-700 hover:underline"
        >
          {t("myRoutes")} {open ? "▴" : "▾"}
        </button>
      </div>
      {open && (
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {tours.length === 0 && (
            <p className="text-[10px] text-neutral-400">{t("empty")}</p>
          )}
          {tours.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-[11px]"
            >
              <button
                type="button"
                onClick={() => loadTour(row.id)}
                className="min-w-0 flex-1 truncate text-left hover:text-emerald-700"
                title={row.name}
              >
                {row.name}
                <span className="ml-1 text-neutral-400">
                  {(row.stats.distanceM / 1000).toFixed(0)} km
                </span>
              </button>
              {row.visibility === "public" && (
                <a
                  href={`/tour/${row.id}`}
                  target="_blank"
                  className="shrink-0 text-emerald-700 hover:underline"
                  title={t("viewPage")}
                >
                  ↗
                </a>
              )}
              <VisibilitySelect
                compact
                value={row.visibility}
                onChange={(v) => setVisibility(row, v)}
              />
              <button
                type="button"
                onClick={() => deleteTour(row.id)}
                className="shrink-0 text-neutral-300 hover:text-red-600"
                aria-label={t("delete")}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
