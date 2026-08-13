"use client";

// GEN-117 — speed-vs-distance profile for completed activities.
// Hover syncs with the map (same contract as ElevationChart); dragging
// selects a segment and shows its distance / time / avg speed / ascent.

import { useMemo, useRef, useState } from "react";

type Props = {
  speeds: number[]; // km/h per point
  distances: number[]; // cumulative metres per point
  timeOffsets: number[]; // seconds since start per point
  elevation: number[];
  onHover: (idx: number | null) => void;
  segmentLabel: string; // pre-translated "Selection"
};

const W = 300;
const H = 72;
const PAD = 4;

export default function SpeedChart({
  speeds,
  distances,
  timeOffsets,
  elevation,
  onHover,
  segmentLabel,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const dragStart = useRef<number | null>(null);

  const totalM = distances[distances.length - 1] ?? 1;
  const maxSpeed = useMemo(() => Math.max(5, ...speeds), [speeds]);

  const xFor = (i: number) => PAD + (distances[i] / totalM) * (W - 2 * PAD);
  const yFor = (v: number) => H - PAD - (v / maxSpeed) * (H - 2 * PAD);

  const path = useMemo(() => {
    if (speeds.length < 2) return "";
    return speeds
      .map((s, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(s).toFixed(1)}`)
      .join("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speeds, distances, maxSpeed]);

  function idxAt(clientX: number): number {
    const rect = svgRef.current!.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const targetM = frac * totalM;
    // distances is monotonic — binary search
    let lo = 0;
    let hi = distances.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (distances[mid] < targetM) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  const selStats = useMemo(() => {
    if (!sel) return null;
    const [a, b] = sel;
    if (b - a < 2) return null;
    const distM = distances[b] - distances[a];
    const timeS = timeOffsets[b] - timeOffsets[a];
    let up = 0;
    for (let i = a + 1; i <= b; i++) {
      const de = elevation[i] - elevation[i - 1];
      if (de > 0) up += de;
    }
    return {
      km: (distM / 1000).toFixed(1),
      time: `${Math.floor(timeS / 60)}:${String(timeS % 60).padStart(2, "0")}`,
      avg: timeS > 0 ? ((distM / timeS) * 3.6).toFixed(1) : "0",
      up: Math.round(up),
    };
  }, [sel, distances, timeOffsets, elevation]);

  if (speeds.length < 2) return null;

  return (
    // shrink-0: als directe flex-kolom-child van het info-paneel zou deze
    // anders (net als het hoogteprofiel) tot 0px worden samengeperst.
    <div className="shrink-0">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        // Zonder expliciete hoogte klapt de w-full SVG in tot 0px; vaste
        // hoogte (= viewBox-H) geeft een betrouwbare, correcte hoogte.
        className="h-[72px] w-full cursor-crosshair touch-none select-none"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          dragStart.current = idxAt(e.clientX);
          setSel(null);
        }}
        onPointerMove={(e) => {
          const i = idxAt(e.clientX);
          onHover(i);
          if (dragStart.current !== null) {
            const a = Math.min(dragStart.current, i);
            const b = Math.max(dragStart.current, i);
            if (b - a >= 2) setSel([a, b]);
          }
        }}
        onPointerUp={() => {
          dragStart.current = null;
        }}
        onPointerLeave={() => {
          onHover(null);
          dragStart.current = null;
        }}
      >
        <rect x="0" y="0" width={W} height={H} rx="6" className="fill-neutral-50" />
        {sel && (
          <rect
            x={xFor(sel[0])}
            y={PAD}
            width={Math.max(1, xFor(sel[1]) - xFor(sel[0]))}
            height={H - 2 * PAD}
            className="fill-sky-200/60"
          />
        )}
        <path d={path} className="fill-none stroke-sky-600" strokeWidth="1.2" />
        <text x={W - PAD} y={PAD + 8} textAnchor="end" className="fill-neutral-400 text-[8px]">
          max {maxSpeed.toFixed(0)} km/h
        </text>
      </svg>
      {selStats && (
        <div className="mt-1 rounded bg-sky-50 px-2 py-1 text-[10px] text-sky-900">
          {segmentLabel}: {selStats.km} km · {selStats.time} · Ø {selStats.avg} km/h · ↗{" "}
          {selStats.up} m
        </div>
      )}
    </div>
  );
}
