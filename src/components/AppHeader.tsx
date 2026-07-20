"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

type Hit = {
  type: "route" | "place" | "person";
  label: string;
  sub: string;
  href: string;
};

export default function AppHeader() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setEmail(s?.user?.email ?? null);
      setUserId(s?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  function onChange(v: string) {
    setQ(v);
    clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const [tours, people, places] = await Promise.all([
        sb
          .from("tours")
          .select("id,name,sport,stats")
          .ilike("name", `%${v}%`)
          .limit(4),
        sb
          .from("profiles")
          .select("id,display_name,home_region")
          .ilike("display_name", `%${v}%`)
          .limit(3),
        fetch(`/api/geo/search?q=${encodeURIComponent(v)}`)
          .then((r) => r.json())
          .catch(() => ({ results: [] })),
      ]);
      const routeHits: Hit[] = (tours.data ?? []).map(
        (r: { id: string; name: string; sport: string; stats: { distanceM: number } }) => ({
          type: "route",
          label: r.name,
          sub: `${(r.stats.distanceM / 1000).toFixed(0)} km · ${r.sport}`,
          href: `/${locale}/tour/${r.id}`,
        }),
      );
      const personHits: Hit[] = (people.data ?? []).map(
        (u: { id: string; display_name: string | null; home_region: string | null }) => ({
          type: "person",
          label: u.display_name ?? "?",
          sub: u.home_region ?? "",
          href: `/${locale}/user/${u.id}`,
        }),
      );
      const placeHits: Hit[] = (places.results ?? [])
        .slice(0, 4)
        .map((p: { name: string; label: string; lon: number; lat: number }) => ({
          type: "place",
          label: p.name,
          sub: p.label,
          href: `/${locale}?at=${p.lon.toFixed(5)},${p.lat.toFixed(5)}&atn=${encodeURIComponent(p.name)}`,
        }));
      setHits([...routeHits, ...personHits, ...placeHits]);
      setOpen(true);
    }, 250);
  }

  const routeHits = hits.filter((h) => h.type === "route");
  const personHits = hits.filter((h) => h.type === "person");
  const placeHits = hits.filter((h) => h.type === "place");

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-4 bg-white/95 px-4 shadow-sm backdrop-blur">
      <a href={`/${locale}`} aria-label="Outdoor Route Planner" className="flex items-center gap-2 font-semibold text-emerald-800">
        <span aria-hidden>⛰</span>
        <span className="hidden sm:inline">Outdoor Route Planner</span>
      </a>

      {/* Search collapses away on mobile — the planner panel has its own fields */}
      <div className="relative hidden max-w-md flex-1 md:block">
        <input
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-full border border-neutral-200 bg-neutral-50 px-4 py-1.5 text-sm outline-none focus:border-emerald-600"
        />
        {open && hits.length > 0 && (
          <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
            {routeHits.length > 0 && (
              <div className="px-3 pt-2 text-[10px] font-semibold uppercase text-neutral-400">
                {t("routes")}
              </div>
            )}
            {routeHits.map((h, i) => (
              <a key={`r${i}`} href={h.href} className="block px-3 py-2 text-sm hover:bg-neutral-50">
                <span className="font-medium">{h.label}</span>
                <span className="ml-2 text-xs text-neutral-500">{h.sub}</span>
              </a>
            ))}
            {personHits.length > 0 && (
              <div className="px-3 pt-2 text-[10px] font-semibold uppercase text-neutral-400">
                {t("people")}
              </div>
            )}
            {personHits.map((h, i) => (
              <a key={`u${i}`} href={h.href} className="block px-3 py-2 text-sm hover:bg-neutral-50">
                <span className="font-medium">{h.label}</span>
                <span className="ml-2 text-xs text-neutral-500">{h.sub}</span>
              </a>
            ))}
            {placeHits.length > 0 && (
              <div className="px-3 pt-2 text-[10px] font-semibold uppercase text-neutral-400">
                {t("places")}
              </div>
            )}
            {placeHits.map((h, i) => (
              <a key={`p${i}`} href={h.href} className="block px-3 py-2 text-sm hover:bg-neutral-50">
                <span className="font-medium">{h.label}</span>
                <span className="ml-2 text-xs text-neutral-500">{h.sub}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <nav className="ml-auto flex items-center gap-2 whitespace-nowrap text-sm max-md:gap-2 max-md:overflow-x-auto max-md:text-xs md:gap-3">
        <a href={`/${locale}`} className="text-neutral-700 hover:text-emerald-800">
          {t("planner")}
        </a>
        <a href={`/${locale}/discover`} className="text-neutral-700 hover:text-emerald-800">
          {t("discover")}
        </a>
        {email && (
          <a href={`/${locale}/feed`} className="text-neutral-700 hover:text-emerald-800">
            {t("feed")}
          </a>
        )}
        <a
          href={`/${locale}/collections`}
          className="hidden text-neutral-700 hover:text-emerald-800 sm:inline"
        >
          {t("collections")}
        </a>
        <a href={`/${locale}/routes`} className="text-neutral-700 hover:text-emerald-800">
          {t("myRoutes")}
        </a>
        <a
          href={`/${locale === "nl" ? "en" : "nl"}`}
          className="text-xs uppercase text-neutral-400 hover:text-neutral-700"
        >
          {locale === "nl" ? "EN" : "NL"}
        </a>
        {email ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white"
              title={email}
            >
              {email[0]?.toUpperCase()}
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
                <div className="truncate px-3 py-1.5 text-[11px] text-neutral-400">
                  {email}
                </div>
                {userId && (
                  <a
                    href={`/${locale}/user/${userId}`}
                    className="block px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    {t("myProfile")}
                  </a>
                )}
                <a
                  href={`/${locale}/routes`}
                  className="block px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  {t("myRoutes")}
                </a>
                <button
                  type="button"
                  onMouseDown={() => sb.auth.signOut()}
                  className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-neutral-50"
                >
                  {t("logout")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <a
            href={`/${locale}/routes`}
            className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800"
          >
            {t("login")}
          </a>
        )}
      </nav>
    </header>
  );
}
