"use client";

// TOTP 2FA enrollment/management (klein plan F1). Lives in the logged-in
// AccountPanel view; optional for everyone, enforced for the admin via the
// self-arming rule in adminAuth. QR comes straight from Supabase's enroll
// response (SVG string) — no QR dependency.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

type Factor = { id: string; friendly_name?: string; status: "verified" | "unverified" };

export default function MfaSection() {
  const t = useTranslations("account.mfa");
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [open, setOpen] = useState(false);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await sb.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
  }, [sb]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  async function startEnroll() {
    setBusy(true);
    setErr(null);
    // Clean up stale unverified factors first — a dangling one blocks re-enroll.
    const { data: all } = await sb.auth.mfa.listFactors();
    for (const f of all?.all ?? []) {
      if (f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await sb.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "authenticator",
    });
    setBusy(false);
    if (error || !data) {
      setErr(error?.message ?? "enroll failed");
      return;
    }
    setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verifyEnroll() {
    if (!enroll) return;
    setBusy(true);
    setErr(null);
    const { error } = await sb.auth.mfa.challengeAndVerify({
      factorId: enroll.factorId,
      code: code.trim(),
    });
    setBusy(false);
    if (error) {
      setErr(t("wrongCode"));
      return;
    }
    setEnroll(null);
    setCode("");
    refresh();
  }

  async function removeFactor(id: string) {
    if (!window.confirm(t("removeConfirm"))) return;
    await sb.auth.mfa.unenroll({ factorId: id });
    refresh();
  }

  const verified = factors.filter((f) => f.status === "verified");

  return (
    <div className="border-t border-neutral-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] text-neutral-400 hover:text-neutral-600"
      >
        🔐 {t("title")} {verified.length > 0 ? "✓" : ""} {open ? "▴" : "▾"}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2 text-xs">
          {verified.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg bg-emerald-50 px-2 py-1.5">
              <span className="text-emerald-800">✓ {t("active")}</span>
              <button
                type="button"
                onClick={() => removeFactor(f.id)}
                className="text-neutral-400 hover:text-red-600"
              >
                {t("remove")}
              </button>
            </div>
          ))}

          {!enroll && verified.length === 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={startEnroll}
              className="self-start rounded-lg bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
            >
              + {t("enable")}
            </button>
          )}

          {enroll && (
            <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-2">
              <p className="text-neutral-600">{t("scanHint")}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  enroll.qr.startsWith("data:")
                    ? enroll.qr
                    : `data:image/svg+xml;utf-8,${encodeURIComponent(enroll.qr)}`
                }
                alt="TOTP QR"
                className="h-36 w-36 self-center rounded bg-white"
              />
              <p className="break-all text-[10px] text-neutral-400">
                {t("secretHint")}: <span className="select-all font-mono">{enroll.secret}</span>
              </p>
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  maxLength={6}
                  className="w-24 rounded border border-neutral-200 px-2 py-1"
                />
                <button
                  type="button"
                  disabled={busy || code.trim().length !== 6}
                  onClick={verifyEnroll}
                  className="rounded-lg bg-emerald-700 px-3 py-1 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {t("verify")}
                </button>
                <button
                  type="button"
                  onClick={() => setEnroll(null)}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          {err && <p className="text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}
