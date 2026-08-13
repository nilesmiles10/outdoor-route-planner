"use client";

import { useMemo, useRef, useState } from "react";
import type { Climb } from "@/lib/elevation";

type Props = {
  elevation: number[];
  distances: number[]; // cumulative meters, same length
  climbs: Climb[];
  onHover: (index: number | null) => void;
};

const W = 320;
const H = 96;
const PAD_TOP = 10;
const PAD_BOTTOM = 14;

// Steilheids-kleuren op het profiel (Komoot-signatuur): in één oogopslag zien
// wáár een route zwaar wordt, niet alleen hoeveel totale klim. Absolute grade
// (klim én afdaling tellen), sequentieel koel→warm zodat "warmer = steiler"
// vanzelf leest. Grenzen ~ gangbare fiets/wandel-steilheidsschaal.
// Eén bron voor de lijnkleuring én de legenda (GradeLegend), zodat ze nooit
// uit elkaar lopen. Labels zijn numeriek/locale-neutraal.
export const GRADE_BANDS: { max: number; color: string; label: string }[] = [
  { max: 3, color: "#3b82f6", label: "<3%" }, // vlak — blauw (oude lijnkleur)
  { max: 6, color: "#eab308", label: "3–6%" }, // geel
  { max: 9, color: "#f97316", label: "6–9%" }, // oranje
  { max: 12, color: "#ef4444", label: "9–12%" }, // rood
  { max: Infinity, color: "#b91c1c", label: "≥12%" }, // donkerrood
];

function gradeColor(absPct: number): string {
  for (const b of GRADE_BANDS) if (absPct < b.max) return b.color;
  return GRADE_BANDS[GRADE_BANDS.length - 1].color;
}
// Grade wordt over een afstand-venster gemeten i.p.v. tussen twee naburige
// samples: routing-hoogte is ruizig (±1-2 m), waardoor per-segment-grade anders
// wild zou flikkeren. 50 m dempt dat zonder echte hellingen glad te strijken.
const GRADE_WINDOW_M = 50;

// Getekende grade (%) op index i, over het GRADE_WINDOW_M-venster. Positief =
// omhoog, negatief = omlaag. Gedeeld door de lijnkleuring (abs) én de hover-
// aflezing (met teken). Robuust voor i = laatste index.
function gradeAtIndex(
  elevation: number[],
  distances: number[],
  i: number,
): number {
  const n = elevation.length;
  if (n < 2) return 0;
  const fwd = Math.min(i + 1, n - 1);
  let lo = i;
  while (lo > 0 && distances[i] - distances[lo] < GRADE_WINDOW_M / 2) lo--;
  let hi = fwd;
  while (hi < n - 1 && distances[hi] - distances[fwd] < GRADE_WINDOW_M / 2) hi++;
  const dd = distances[hi] - distances[lo];
  if (dd <= 0) return 0;
  return ((elevation[hi] - elevation[lo]) / dd) * 100;
}

export default function ElevationChart({
  elevation,
  distances,
  climbs,
  onHover,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const totalM = distances[distances.length - 1] ?? 0;
  const min = useMemo(() => Math.min(...elevation), [elevation]);
  const max = useMemo(() => Math.max(...elevation), [elevation]);
  const range = Math.max(max - min, 10);

  const x = (i: number) => (distances[i] / totalM) * W;
  const y = (e: number) =>
    H - PAD_BOTTOM - ((e - min) / range) * (H - PAD_TOP - PAD_BOTTOM);

  const linePts = useMemo(
    () => elevation.map((e, i) => `${x(i).toFixed(1)},${y(e).toFixed(1)}`).join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elevation, distances],
  );

  // Deel de profiellijn op in kleur-runs op basis van de (gedempte) grade.
  // Aaneengesloten segmenten met dezelfde kleur worden tot één polyline
  // samengevoegd — dat voorkomt gaten tussen losse <line>s en scheelt nodes.
  const segments = useMemo(() => {
    const n = elevation.length;
    if (n < 2) return [] as { points: string; color: string }[];
    const gradeAt = (i: number) =>
      Math.abs(gradeAtIndex(elevation, distances, i));
    const runs: { points: string; color: string }[] = [];
    let cur: string[] = [`${x(0).toFixed(1)},${y(elevation[0]).toFixed(1)}`];
    let curColor = gradeColor(gradeAt(0));
    for (let i = 1; i < n; i++) {
      const color = i < n - 1 ? gradeColor(gradeAt(i)) : curColor;
      const pt = `${x(i).toFixed(1)},${y(elevation[i]).toFixed(1)}`;
      if (color !== curColor) {
        cur.push(pt); // sluit de vorige run op dit punt (naadloze overgang)
        runs.push({ points: cur.join(" "), color: curColor });
        cur = [pt];
        curColor = color;
      } else {
        cur.push(pt);
      }
    }
    if (cur.length > 1) runs.push({ points: cur.join(" "), color: curColor });
    return runs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elevation, distances]);

  if (elevation.length < 2 || totalM <= 0) return null;

  function idxAt(clientX: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const targetM = frac * totalM;
    // binary search nearest distance
    let lo = 0;
    let hi = distances.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (distances[mid] < targetM) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  const hover = (idx: number | null) => {
    setHoverIdx(idx);
    onHover(idx);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      // De SVG is een directe flex-kolom-child van het info-paneel; met de
      // default flex-shrink:1 werd hij tot 0px samengeperst → onzichtbaar
      // hoogteprofiel (geen expliciete hoogte + intrinsieke viewBox-hoogte
      // niet afgeleid). shrink-0 + vaste hoogte (= viewBox-H) garanderen de
      // hoogte; box-aspect ≈ viewBox-aspect dus vrijwel geen letterboxing.
      className="h-24 w-full shrink-0 cursor-crosshair touch-none select-none"
      role="img"
      aria-label="Elevation profile"
      // Pointer-events i.p.v. mouse-only: op desktop scrubben bij hover (muis-
      // pointermove vuurt zonder ingedrukte knop), op mobiel scrubben tijdens
      // een sleep (touch-pointermove vuurt alleen met vinger neer). touch-none
      // voorkomt page-scroll tijdens het slepen over de grafiek.
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        hover(idxAt(e.clientX));
      }}
      onPointerMove={(e) => hover(idxAt(e.clientX))}
      onPointerUp={(e) => {
        // Muis: laat de marker staan bij hover (geen flikker per klik). Touch/
        // pen: wissen zodra de vinger loskomt.
        if (e.pointerType !== "mouse") hover(null);
      }}
      onPointerLeave={() => hover(null)}
    >
      {/* climb bands */}
      {climbs.map((c, i) => (
        <rect
          key={i}
          x={x(c.startIdx)}
          y={PAD_TOP}
          width={Math.max(x(c.endIdx) - x(c.startIdx), 2)}
          height={H - PAD_TOP - PAD_BOTTOM}
          fill="rgb(234 88 12 / 0.12)"
        />
      ))}
      <polyline
        points={`0,${H - PAD_BOTTOM} ${linePts} ${W},${H - PAD_BOTTOM}`}
        fill="rgb(37 99 235 / 0.15)"
        stroke="none"
      />
      {/* Profiellijn in steilheids-kleuren (zie gradeColor). Valt terug op één
          blauwe lijn als er maar één run is (vlakke route). */}
      {segments.map((s, i) => (
        <polyline
          key={i}
          points={s.points}
          fill="none"
          stroke={s.color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <text x="2" y="9" className="fill-neutral-500" fontSize="8">
        {Math.round(max)} m
      </text>
      <text x="2" y={H - 3} className="fill-neutral-500" fontSize="8">
        {Math.round(min)} m
      </text>
      {hoverIdx !== null && (
        <g>
          <line
            x1={x(hoverIdx)}
            x2={x(hoverIdx)}
            y1={PAD_TOP}
            y2={H - PAD_BOTTOM}
            stroke="#404040"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <circle
            cx={x(hoverIdx)}
            cy={y(elevation[hoverIdx])}
            r="3"
            fill="#2563eb"
            stroke="#fff"
            strokeWidth="1.5"
          />
          <text
            x={x(hoverIdx) > W - 95 ? x(hoverIdx) - 4 : x(hoverIdx) + 4}
            y={PAD_TOP + 8}
            textAnchor={x(hoverIdx) > W - 95 ? "end" : "start"}
            fontSize="9"
            className="fill-neutral-700"
          >
            {(distances[hoverIdx] / 1000).toFixed(1)} km ·{" "}
            {Math.round(elevation[hoverIdx])} m
            {(() => {
              // Grade bij de cursor (Komoot toont dit): met teken, +omhoog.
              const g = gradeAtIndex(elevation, distances, hoverIdx);
              return ` · ${g >= 0 ? "+" : ""}${g.toFixed(1)}%`;
            })()}
          </text>
        </g>
      )}
    </svg>
  );
}
