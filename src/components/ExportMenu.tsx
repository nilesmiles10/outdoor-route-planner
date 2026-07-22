"use client";

// GEN-143 — export-menu (GPX · TCX · FIT) op tourpagina, /routes en in
// de planner. TCX/FIT zijn course-bestanden met turn-instructies waar
// beschikbaar; de FIT-encoder (@garmin/fitsdk) laadt lazy bij gebruik.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { buildGpx, type GpxWaypoint } from "@/lib/gpx";
import { buildCourse, type CourseTurn } from "@/lib/course";
import { buildTcx } from "@/lib/tcx";

export type ExportData = {
  name: string;
  sport: string;
  coords: GeoJSON.Position[];
  elevation: number[];
  waypoints: GpxWaypoint[];
  durationS: number;
  turns?: CourseTurn[] | null;
};

function saveBlob(blob: Blob, name: string, ext: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^\w\- ]+/g, "").slice(0, 60) || "route"}.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ExportMenu({
  getData,
  compact,
}: {
  getData: () => Promise<ExportData> | ExportData;
  compact?: boolean;
}) {
  const t = useTranslations("export");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(fmt: "gpx" | "tcx" | "fit") {
    setBusy(true);
    try {
      const d = await getData();
      if (fmt === "gpx") {
        saveBlob(
          new Blob([buildGpx(d.name, d.coords, d.elevation, d.waypoints)], {
            type: "application/gpx+xml",
          }),
          d.name,
          "gpx",
        );
      } else {
        const course = buildCourse(d);
        if (fmt === "tcx") {
          saveBlob(
            new Blob([buildTcx(course)], { type: "application/vnd.garmin.tcx+xml" }),
            d.name,
            "tcx",
          );
        } else {
          const { buildFitCourse } = await import("@/lib/fitCourse");
          const bytes = await buildFitCourse(course);
          saveBlob(
            new Blob([bytes as BlobPart], { type: "application/octet-stream" }),
            d.name,
            "fit",
          );
        }
      }
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const itemCls =
    "block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={
          compact
            ? "rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-200"
            : "rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
        }
      >
        ⤓ {t("button")} ▾
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-1 w-52 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
          <button type="button" disabled={busy} onMouseDown={() => run("gpx")} className={itemCls}>
            GPX <span className="text-neutral-400">· {t("gpxHint")}</span>
          </button>
          <button type="button" disabled={busy} onMouseDown={() => run("tcx")} className={itemCls}>
            TCX <span className="text-neutral-400">· {t("courseHint")}</span>
          </button>
          <button type="button" disabled={busy} onMouseDown={() => run("fit")} className={itemCls}>
            FIT <span className="text-neutral-400">· {t("courseHint")}</span>
          </button>
          <p className="border-t border-neutral-100 px-3 py-1.5 text-[10px] text-neutral-400">
            {t("note")}
          </p>
        </div>
      )}
    </div>
  );
}
