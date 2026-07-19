import { miniPath } from "@/lib/collections";

// Lightweight SVG route thumbnail — draws a normalized polyline of a tour's
// geometry. Used on collection cards where a full MapLibre canvas is overkill.
export default function MiniMap({
  coords,
  className = "",
  stroke = "#047857",
}: {
  coords: [number, number][] | undefined;
  className?: string;
  stroke?: string;
}) {
  const w = 160;
  const h = 100;
  const d = miniPath(coords, w, h);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {d ? (
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
