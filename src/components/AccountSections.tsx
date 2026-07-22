"use client";

// Accountbeheer op de eigen profielpagina (verhuisd uit het planner-
// paneel): privacy-instellingen, 2FA en account verwijderen. De planner
// houdt alleen route-opslaan; uitloggen zit in de header-dropdown.
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import MfaSection from "./MfaSection";
import PrivacySettings from "./PrivacySettings";

export default function AccountSections({ userId }: { userId: string }) {
  const t = useTranslations("account");
  const tp = useTranslations("profile");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
  }, [sb]);

  // Alleen op het eigen profiel renderen.
  if (!user || user.id !== userId) return null;

  async function deleteAccount() {
    if (!user) return;
    const phrase = user.email ?? "delete";
    const v = window.prompt(`${t("deleteAccountConfirm")}\n\n"${phrase}"`);
    if (v !== phrase) return;
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (res.ok) {
      await sb.auth.signOut();
      window.location.href = `/${locale}`;
    } else {
      alert(t("deleteAccountFailed"));
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-neutral-200 bg-white p-3">
      <h3 className="text-xs font-semibold text-neutral-700">
        ⚙️ {tp("accountTitle")}
      </h3>
      <div className="mt-2 flex flex-col gap-2">
        <PrivacySettings userId={userId} />
        <div className="border-t border-neutral-200 pt-2">
          <MfaSection />
        </div>
        <div className="border-t border-neutral-200 pt-2">
          <button
            type="button"
            onClick={deleteAccount}
            className="text-xs text-neutral-400 hover:text-red-600 hover:underline"
          >
            {t("deleteAccount")}
          </button>
        </div>
      </div>
    </section>
  );
}
