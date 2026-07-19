"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

type Hit = {
  type: "route" | "place";
  label: string;
  sub: string;
  href: string;
};

export default function AppHeader() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) =>
      setEmail(s?.user?.email ?? null),
    );
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
      const [tours, places] = await Promise.all([
        sb
          .from("tours")
          .select("id,name,sport,stats")
          .ilike("name", `%${v}%`)
          .limit(4),
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
      const placeHits: Hit[] = (places.results ?? [])
        .slice(0, 4)
        .map((p: { name: string; label: string; lon: number; lat: number }) => ({
          type: "place",
          label: p.name,
          sub: p.label,
          href: `/${locale}?at=${p.lon.toFixed(5)},${p.lat.toFixed(5)}&atn=${encodeURIComponent(p.name)}`,
        }));
      setHits([...routeHits, ...placeHits]);
      setOpen(true);
    }, 250);
  }

  const routeHits = hits.filter((h) => h.type === "route");
  const placeHits = hits.filter((h) => h.type === "place");

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-4 bg-white/95 px-4 shadow-sm backdrop-blur">
      <a href={`/${locale}`} className="flex items-center gap-2 font-semibold text-emerald-800">
        <span aria-hidden>⛰</span>
        <span className="hidden sm:inline">Outdoor Route Planner</span>
      </a>

      <div className="relative max-w-md flex-1">
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

      <nav className="flex items-center gap-3 text-sm">
        <a href={`/${locale}`} className="text-neutral-700 hover:text-emerald-800">
          {t("planner")}
        </a>
        <a href={`/${locale}/discover`} className="text-neutral-700 hover:text-emerald-800">
          {t("discover")}
        </a>
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
