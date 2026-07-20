"use client";

// Bottom-left account block in the admin sidebar: who you are + edit
// profile / change password / sign out.
import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function AdminAccount() {
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
  }, [sb]);

  async function changePassword() {
    if (pw.length < 8) {
      setErr("Min. 8 characters");
      return;
    }
    setErr(null);
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) {
      setErr(error.message);
    } else {
      setMsg("Password updated ✓");
      setPw("");
      setPwOpen(false);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  async function signOut() {
    await sb.auth.signOut();
    window.location.href = "/nl";
  }

  if (!user) return null;
  const initial = (user.email?.[0] ?? "?").toUpperCase();

  return (
    <div className="mt-auto border-t border-neutral-100 pt-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-neutral-800">{user.email}</div>
          <div className="text-[10px] text-emerald-700">admin</div>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-1 text-xs">
        <a
          href={`/nl/user/${user.id}`}
          target="_blank"
          className="rounded px-1.5 py-1 text-neutral-600 hover:bg-neutral-100"
        >
          ✎ Edit profile ↗
        </a>
        {!pwOpen ? (
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            className="rounded px-1.5 py-1 text-left text-neutral-600 hover:bg-neutral-100"
          >
            🔑 Change password
          </button>
        ) : (
          <div className="flex flex-col gap-1 rounded-lg border border-neutral-200 p-2">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="New password"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") changePassword();
                if (e.key === "Escape") setPwOpen(false);
              }}
              className="rounded border border-neutral-200 px-2 py-1"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={changePassword}
                disabled={pw.length < 8}
                className="rounded bg-emerald-700 px-2 py-1 font-medium text-white disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setPwOpen(false);
                  setPw("");
                  setErr(null);
                }}
                className="text-neutral-400 hover:text-neutral-600"
              >
                cancel
              </button>
            </div>
          </div>
        )}
        <a href="/nl" className="rounded px-1.5 py-1 text-neutral-600 hover:bg-neutral-100">
          ← Back to site
        </a>
        <button
          type="button"
          onClick={signOut}
          className="rounded px-1.5 py-1 text-left text-red-600 hover:bg-red-50"
        >
          ⏻ Sign out
        </button>
        {msg && <p className="text-emerald-700">{msg}</p>}
        {err && <p className="text-red-600">{err}</p>}
      </div>
    </div>
  );
}
