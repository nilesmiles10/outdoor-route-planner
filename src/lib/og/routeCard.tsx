import { ImageResponse } from "next/og";

// Gedeelde OG-share-kaart voor routes (tour én trail): route-polyline als pure
// SVG (geen externe tiles → werkt in de OG-renderer) + kop-stats. Eén bron
// zodat tour- en trail-shares dezelfde nette kaart krijgen.

export const OG_SIZE = { width: 1200, height: 630 };

export function notFoundOgCard() {
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
    OG_SIZE,
  );
}

// Merk-OG-kaart zonder specifieke route: voor de homepage én als fallback voor
// elke pagina zonder eigen OG-afbeelding (regio-categorie, profiel, discover…).
// Zónder deze had de meest-gedeelde URL (tarnoo.com) géén preview-afbeelding.
export function siteOgCard(tagline: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #ecfdf5 0%, #a7f3d0 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="132" height="132" viewBox="0 0 512 512">
            <rect width="512" height="512" rx="116" fill="#047857" />
            <path d="M232 316 L330 188 L430 316 Z" fill="#6ee7b7" />
            <path d="M96 316 L212 150 L318 316 Z" fill="#ffffff" />
            <rect x="150" y="352" width="150" height="12" rx="6" fill="#ffffff" />
            <rect x="118" y="386" width="90" height="12" rx="6" fill="#a7f3d0" />
          </svg>
          <div
            style={{
              fontSize: 104,
              fontWeight: 800,
              color: "#065f46",
              letterSpacing: -3,
            }}
          >
            Tarnoo
          </div>
        </div>
        <div
          style={{ fontSize: 44, color: "#047857", marginTop: 26, fontWeight: 500 }}
        >
          {tagline}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

export function routeOgCard({
  name,
  sportLabel,
  coords,
  distanceM,
  ascendM,
}: {
  name: string;
  sportLabel: string;
  coords: [number, number][];
  distanceM: number;
  ascendM: number;
}) {
  if (!coords || coords.length < 2) return notFoundOgCard();
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
  const km = (distanceM / 1000).toFixed(1);

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
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width="72" height="72" viewBox="0 0 512 512">
              <rect width="512" height="512" rx="116" fill="#047857" />
              <path d="M232 316 L330 188 L430 316 Z" fill="#6ee7b7" />
              <path d="M96 316 L212 150 L318 316 Z" fill="#ffffff" />
              <rect x="150" y="352" width="150" height="12" rx="6" fill="#ffffff" />
              <rect x="118" y="386" width="90" height="12" rx="6" fill="#a7f3d0" />
            </svg>
            <div style={{ fontSize: 22, color: "#047857", fontWeight: 700 }}>
              TARNOO
            </div>
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
            {name.slice(0, 60)}
          </div>
          <div
            style={{
              display: "flex",
              gap: 28,
              marginTop: 28,
              fontSize: 34,
              color: "#374151",
            }}
          >
            <span>{km} km</span>
            <span>↗ {ascendM} m</span>
            <span>{sportLabel}</span>
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
    OG_SIZE,
  );
}

const OVERVIEW_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
];

// OG-share-kaart voor een collectie: álle route-vormen in één gedeeld kader
// (elk een eigen kleur), plus titel + samengevatte stats.
export function collectionOgCard({
  title,
  routes,
  distanceM,
  ascendM,
  routesLabel,
}: {
  title: string;
  routes: [number, number][][];
  distanceM: number;
  ascendM: number;
  routesLabel: string; // bv. "5 routes"
}) {
  const usable = routes.filter((c) => c && c.length >= 2);
  if (!usable.length) return notFoundOgCard();
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const coords of usable) {
    for (const [lon, lat] of coords) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  const spanLon = Math.max(maxLon - minLon, 1e-4);
  const spanLat = Math.max(maxLat - minLat, 1e-4);
  const W = 640;
  const H = 470;
  const polys = usable.map((coords) => {
    const step = Math.max(1, Math.floor(coords.length / 80));
    return coords
      .filter((_, i) => i % step === 0 || i === coords.length - 1)
      .map((c) => {
        const x = ((c[0] - minLon) / spanLon) * (W - 40) + 20;
        const y = H - (((c[1] - minLat) / spanLat) * (H - 40) + 20);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  });
  const km = (distanceM / 1000).toFixed(0);

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
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width="72" height="72" viewBox="0 0 512 512">
              <rect width="512" height="512" rx="116" fill="#047857" />
              <path d="M232 316 L330 188 L430 316 Z" fill="#6ee7b7" />
              <path d="M96 316 L212 150 L318 316 Z" fill="#ffffff" />
              <rect x="150" y="352" width="150" height="12" rx="6" fill="#ffffff" />
              <rect x="118" y="386" width="90" height="12" rx="6" fill="#a7f3d0" />
            </svg>
            <div style={{ fontSize: 22, color: "#047857", fontWeight: 700 }}>
              TARNOO
            </div>
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
            {title.slice(0, 60)}
          </div>
          <div
            style={{
              display: "flex",
              gap: 28,
              marginTop: 28,
              fontSize: 34,
              color: "#374151",
            }}
          >
            <span>{routesLabel}</span>
            <span>{km} km</span>
            <span>↗ {ascendM} m</span>
          </div>
        </div>
        <svg width={W} height={630} viewBox={`0 0 ${W} 630`}>
          <g transform="translate(0, 80)">
            {polys.map((p, i) => (
              <polyline
                key={`c${i}`}
                points={p}
                fill="none"
                stroke="#ffffff"
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {polys.map((p, i) => (
              <polyline
                key={`l${i}`}
                points={p}
                fill="none"
                stroke={OVERVIEW_COLORS[i % OVERVIEW_COLORS.length]}
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        </svg>
      </div>
    ),
    OG_SIZE,
  );
}
