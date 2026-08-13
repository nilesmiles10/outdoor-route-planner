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

  if (elevation.length < 2 || totalM <= 0) return null;

  function idxFromEvent(evt: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const frac = Math.min(Math.max((evt.clientX - rect.left) / rect.width, 0), 1);
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
      className="h-24 w-full shrink-0 cursor-crosshair select-none"
      role="img"
      aria-label="Elevation profile"
      onMouseMove={(e) => hover(idxFromEvent(e))}
      onMouseLeave={() => hover(null)}
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
      <polyline points={linePts} fill="none" stroke="#2563eb" strokeWidth="1.5" />
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
            x={x(hoverIdx) > W - 70 ? x(hoverIdx) - 4 : x(hoverIdx) + 4}
            y={PAD_TOP + 8}
            textAnchor={x(hoverIdx) > W - 70 ? "end" : "start"}
            fontSize="9"
            className="fill-neutral-700"
          >
            {(distances[hoverIdx] / 1000).toFixed(1)} km ·{" "}
            {Math.round(elevation[hoverIdx])} m
          </text>
        </g>
      )}
    </svg>
  );
}
