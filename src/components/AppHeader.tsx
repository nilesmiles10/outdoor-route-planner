"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useSiteSettings } from "./SiteSettingsProvider";

type Hit = {
  type: "route" | "place" | "person";
  label: string;
  sub: string;
  href: string;
};

// Eén bron voor desktop-nav en mobiel menu, zodat ze niet uit elkaar lopen.
const NAV: { key: string; path: string; authOnly?: boolean }[] = [
  { key: "planner", path: "" },
  { key: "discover", path: "/discover" },
  { key: "trails", path: "/trails" },
  { key: "collections", path: "/collections" },
  { key: "myRoutes", path: "/routes" },
  { key: "feed", path: "/feed", authOnly: true },
];

export default function AppHeader() {
  const site = useSiteSettings();
  const t = useTranslations("nav");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Taalwissel: bewaart de HUIDIGE pagina (de oude link ging altijd naar de
  // homepage) en zet NEXT_LOCALE, zodat next-intl bij een volgend bezoek de
  // handmatige keuze respecteert i.p.v. opnieuw de browsertaal te volgen.
  const other = locale === "nl" ? "en" : "nl";
  const switchLocale = () => {
    document.cookie = `NEXT_LOCALE=${other}; path=/; max-age=31536000; samesite=lax`;
    const rest = window.location.pathname.replace(/^\/(nl|en)(?=\/|$)/, "");
    window.location.href = `/${other}${rest}${window.location.search}`;
  };

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
        // RPC ipv directe tabel-query: respecteert search_opt_out,
        // suspension en blocks (profile-optimization plan).
        sb.rpc("search_profiles", { q: v }),
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
    <>
      {/* Scrim: dimt de pagina onder de balk en sluit het menu bij een tik
          ernaast. MOET buiten de <header> staan: die heeft backdrop-blur en
          wordt daardoor het containing block voor fixed-descendants, waardoor
          een scrim binnenin tot de 48px-hoge balk gekrompen werd (hoogte 0).
          Buiten de header is de scrim viewport-fixed. z-30 = boven alle
          pagina-inhoud (≤ z-20); de header (ook z-30) staat er ná in de DOM
          en het menu-paneel (z-40) blijft er dus bovenop. Start op top-12
          zodat de balk niet gedimd wordt. De ✕-knop blijft de toegankelijke
          sluit-control; de scrim is aria-hidden. */}
      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-x-0 bottom-0 top-12 z-30 bg-black/30 md:hidden"
        />
      )}
      <header className="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-4 bg-white/95 px-4 shadow-sm backdrop-blur">
      <a href={`/${locale}`} aria-label={site.site_name} className="flex items-center gap-2 font-semibold text-emerald-800">
        {site.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={site.logo_url} alt="" className="h-7 w-7 rounded object-contain" />
        ) : (
          <span aria-hidden>⛰</span>
        )}
        <span className="hidden sm:inline">{site.site_name}</span>
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
        {open && q.trim().length >= 2 && (
          <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
            {/* Geen-resultaten-feedback: open wordt pas true ná de fetch, dus
                lege hits + query = zoekopdracht zonder treffers (geen flikker
                tijdens het typen). */}
            {hits.length === 0 && (
              <div className="px-3 py-3 text-sm text-neutral-400">
                {t("noResults")}
              </div>
            )}
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

      {/* Desktop-navigatie: inline links. Mobiel kreeg dezelfde rij met
          overflow-x-auto, wat een halve, wegschuivende balk opleverde —
          daar staat nu één hamburger-menu. */}
      <nav className="ml-auto hidden items-center gap-3 whitespace-nowrap text-sm md:flex">
        {NAV.map(({ key, path, authOnly }) =>
          authOnly && !email ? null : (
            <a
              key={key}
              href={`/${locale}${path}`}
              className="text-neutral-700 hover:text-emerald-800"
            >
              {t(key as never)}
            </a>
          ),
        )}
      </nav>

      {/* Account-menu (avatar als ingelogd, anders een icoon): bevat óók de
          taalkeuze — op desktop én mobiel dezelfde plek. */}
      <div className="relative ml-auto md:ml-0">
        <button
          type="button"
          onClick={() => { setMobileOpen(false); setMenuOpen((v) => !v); }}
          onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
            email
              ? "bg-emerald-700 text-white"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
          }`}
          title={email ?? t("account")}
          aria-label={email ?? t("account")}
        >
          {email ? email[0]?.toUpperCase() : "👤"}
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
            {email ? (
              <>
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
              </>
            ) : (
              <a
                href={`/${locale}/routes`}
                className="block px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-neutral-50"
              >
                {t("login")}
              </a>
            )}
            <div className="my-1 border-t border-neutral-100" />
            <button
              type="button"
              onMouseDown={switchLocale}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            >
              <span>🌐 {t("language")}</span>
              <span className="text-xs font-medium uppercase text-neutral-400">
                {other}
              </span>
            </button>
            {email && (
              <button
                type="button"
                onMouseDown={() => sb.auth.signOut()}
                className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-neutral-50"
              >
                {t("logout")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hamburger — alleen mobiel; opent een volledige sheet onder de balk */}
      <button
        type="button"
        onClick={() => { setMenuOpen(false); setMobileOpen((v) => !v); }}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-neutral-700 hover:bg-neutral-100 md:hidden"
        aria-label={t("menu")}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? "✕" : "☰"}
      </button>
      {mobileOpen && (
        <div className="absolute inset-x-0 top-12 z-40 max-h-[calc(100dvh-3rem)] overflow-y-auto border-b border-neutral-200 bg-white shadow-lg md:hidden">
          {/* Mobiel zoeken: de header-zoekbalk is md-only, dus mobiele
              gebruikers konden routes/mensen/plaatsen niet zoeken. Hier in het
              menu wél — hergebruikt dezelfde zoek-state en resultaat-groepen. */}
          <div className="border-b border-neutral-100 p-2">
            <input
              value={q}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm outline-none focus:border-emerald-600"
            />
            {open && q.trim().length >= 2 && hits.length === 0 && (
              <div className="mt-1 px-3 py-2 text-sm text-neutral-400">
                {t("noResults")}
              </div>
            )}
            {hits.length > 0 && (
              <div className="mt-1 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                {routeHits.length > 0 && (
                  <div className="px-3 pt-2 text-[10px] font-semibold uppercase text-neutral-400">
                    {t("routes")}
                  </div>
                )}
                {routeHits.map((h, i) => (
                  <a
                    key={`mr${i}`}
                    href={h.href}
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 text-sm hover:bg-neutral-50"
                  >
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
                  <a
                    key={`mu${i}`}
                    href={h.href}
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 text-sm hover:bg-neutral-50"
                  >
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
                  <a
                    key={`mp${i}`}
                    href={h.href}
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 text-sm hover:bg-neutral-50"
                  >
                    <span className="font-medium">{h.label}</span>
                    <span className="ml-2 text-xs text-neutral-500">{h.sub}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
          <nav className="flex flex-col py-1">
            {NAV.map(({ key, path, authOnly }) =>
              authOnly && !email ? null : (
                <a
                  key={key}
                  href={`/${locale}${path}`}
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-2.5 text-sm text-neutral-800 hover:bg-neutral-50"
                >
                  {t(key as never)}
                </a>
              ),
            )}
          </nav>
        </div>
      )}
      </header>
    </>
  );
}
