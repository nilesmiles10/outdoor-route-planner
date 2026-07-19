"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { buildGpx } from "@/lib/gpx";
import AccountPanel from "@/components/AccountPanel";

type Row = {
  id: string;
  name: string;
  sport: string;
  visibility: "private" | "public";
  stats: { distanceM: number; ascendM: number };
  waypoints: { name: string; lon: number; lat: number }[];
  updated_at: string;
};

export default function RoutesPage() {
  const t = useTranslations("routesPage");
  const locale = useLocale();
  const sb: SupabaseClient = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  const refresh = useCallback(async () => {
    const { data } = await sb
      .from("tours")
      .select("id,name,sport,visibility,stats,waypoints,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    setRows((data as Row[]) ?? []);
  }, [sb]);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  async function download(row: Row) {
    const { data } = await sb
      .from("tours")
      .select("geometry,elevation")
      .eq("id", row.id)
      .single();
    if (!data) return;
    const gpx = buildGpx(
      row.name,
      (data.geometry as GeoJSON.LineString).coordinates,
      data.elevation as number[],
      row.waypoints,
    );
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${row.name.replace(/[^\w\- ]+/g, "").slice(0, 60) || "route"}.gpx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const filtered = rows.filter((r) =>
    r.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-16 pt-20">
      <h1 className="text-xl font-semibold text-neutral-900">{t("title")}</h1>
      {!user ? (
        <div className="mt-6 max-w-sm">
          <p className="mb-3 text-sm text-neutral-600">{t("needLogin")}</p>
          <AccountPanel tour={null} onLoadTour={() => {}} />
        </div>
      ) : (
        <>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="mt-4 w-full max-w-sm rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
          <div className="mt-4 flex flex-col gap-2">
            {filtered.length === 0 && (
              <p className="text-sm text-neutral-400">{t("empty")}</p>
            )}
            {filtered.map((row) => {
              const plannerHref = `/${locale}?w=${row.waypoints
                .map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`)
                .join(";")}&sport=${row.sport}`;
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-100 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-neutral-900">
                      {row.name}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {(row.stats.distanceM / 1000).toFixed(1)} km · ↗{" "}
                      {row.stats.ascendM} m ·{" "}
                      <span className="capitalize">{row.sport}</span> ·{" "}
                      {new Date(row.updated_at).toLocaleDateString(locale)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <a href={plannerHref} className="text-emerald-700 hover:underline">
                      {t("openPlanner")}
                    </a>
                    {row.visibility === "public" && (
                      <a
                        href={`/${locale}/tour/${row.id}`}
                        className="text-emerald-700 hover:underline"
                      >
                        {t("view")}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => download(row)}
                      className="rounded-lg bg-neutral-100 px-2 py-1 hover:bg-neutral-200"
                    >
                      ⤓ GPX
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await sb
                          .from("tours")
                          .update({
                            visibility:
                              row.visibility === "public" ? "private" : "public",
                          })
                          .eq("id", row.id);
                        refresh();
                      }}
                      title={row.visibility}
                    >
                      {row.visibility === "public" ? "🌐" : "🔒"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await sb.from("tours").delete().eq("id", row.id);
                        refresh();
                      }}
                      className="text-neutral-300 hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <footer className="mt-16 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
        © {new Date().getFullYear()} Outdoor Route Planner ·{" "}
        <a href="https://www.openstreetmap.org/copyright" className="hover:underline">
          © OpenStreetMap contributors
        </a>
      </footer>
    </main>
  );
}
