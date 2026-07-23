import { ImageResponse } from "next/og";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// OG card: route polyline drawn as pure SVG (no external tiles → works
// inside the OG renderer), plus headline stats.
export default async function OgImage({
  params,
}: {
  params: { id: string };
}) {
  const sb = supabaseServer();
  const { data: tour } = await sb
    .from("tours")
    .select("name,sport,geometry,stats")
    .eq("id", params.id)
    .maybeSingle();

  if (!tour) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "#fff",
            fontSize: 48,
          }}
        >
          Tarnoo
        </div>
      ),
      size,
    );
  }

  const coords = (tour.geometry as GeoJSON.LineString).coordinates;
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const spanLon = Math.max(maxLon - minLon, 1e-4);
  const spanLat = Math.max(maxLat - minLat, 1e-4);
  const W = 640;
  const H = 470;
  const pts = coords
    .filter((_, i) => i % Math.ceil(coords.length / 300) === 0 || i === coords.length - 1)
    .map((c) => {
      const x = ((c[0] - minLon) / spanLon) * (W - 40) + 20;
      const y = H - (((c[1] - minLat) / spanLat) * (H - 40) + 20);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const km = ((tour.stats as { distanceM: number }).distanceM / 1000).toFixed(1);
  const ascend = (tour.stats as { ascendM: number }).ascendM;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "60px 20px 60px 60px",
            width: 480,
          }}
        >
          <div style={{ fontSize: 22, color: "#047857", fontWeight: 700 }}>
            TARNOO
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 700,
              color: "#111827",
              marginTop: 12,
              lineHeight: 1.15,
            }}
          >
            {(tour.name as string).slice(0, 60)}
          </div>
          <div style={{ display: "flex", gap: 28, marginTop: 28, fontSize: 34, color: "#374151" }}>
            <span>{km} km</span>
            <span>↗ {ascend} m</span>
            <span style={{ textTransform: "capitalize" }}>{tour.sport as string}</span>
          </div>
        </div>
        <svg width={W} height={630} viewBox={`0 0 ${W} 630`}>
          <g transform="translate(0, 80)">
            <polyline
              points={pts}
              fill="none"
              stroke="#ffffff"
              strokeWidth="14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={pts}
              fill="none"
              stroke="#2563eb"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}
