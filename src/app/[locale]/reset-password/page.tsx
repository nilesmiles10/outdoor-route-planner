"use client";

// Password reset (fase D). Two modes on one page:
// - no session: request form → Supabase mails a recovery link (redirects
//   back here; the browser client exchanges the ?code automatically).
// - session present (arrived via the link, or already logged in): set a
//   new password.
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const t = useTranslations("resetPassword");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setHasSession(!!data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) =>
      setHasSession(!!s),
    );
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  async function requestReset() {
    setBusy(true);
    setErr(null);
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/${locale}/reset-password`,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setMsg(t("mailSent"));
  }

  async function setNewPassword() {
    if (password.length < 8) {
      setErr(t("tooShort"));
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setMsg(t("updated"));
      setTimeout(() => (window.location.href = `/${locale}/routes`), 1200);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-sm px-4 pb-16 pt-24">
      <h1 className="text-xl font-semibold text-neutral-900">{t("title")}</h1>
      {hasSession === null ? null : hasSession ? (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-sm text-neutral-600">{t("newPasswordHint")}</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("newPassword")}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || !password}
            onClick={setNewPassword}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {t("save")}
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-sm text-neutral-600">{t("requestHint")}</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("email")}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || !email.includes("@")}
            onClick={requestReset}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {t("send")}
          </button>
        </div>
      )}
      {msg && <p className="mt-3 text-sm text-emerald-700">{msg}</p>}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </main>
  );
}
