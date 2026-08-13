// Gedeelde helper: highlights die een route (<= 250 m off-track) passeert, als
// klikbare kaart-pins. Zelfde logica als de inline-versie op de tour-pagina
// (GEN-117), hier herbruikbaar voor de trail-pagina.
//
// BELANGRIJK: gebruikt een plain anon PostgREST-fetch met revalidate/tags —
// NIET supabaseServer() (dat roept cookies() en zet de hele route dynamisch,
// wat de trail-routes uit de cache haalt; zie getTrail in trail/[id]/page.tsx).
// Highlights zijn publieke data, dus anon-read is correct én cachebaar.

function haversineKm(aLon: number, aLat: number, bLon: number, bLat: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Hl = { id: string; name: string; category: string; lon: number; lat: number };

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export async function passedHighlightPins(
  coords: GeoJSON.Position[],
): Promise<GeoJSON.FeatureCollection> {
  if (!coords || coords.length < 2) return EMPTY;

  const PAD = 0.15; // ~16 km rond de track
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLon = Math.min(...lons) - PAD;
  const maxLon = Math.max(...lons) + PAD;
  const minLat = Math.min(...lats) - PAD;
  const maxLat = Math.max(...lats) + PAD;

  const url =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/highlights` +
    `?kind=eq.point` +
    `&lon=gte.${minLon}&lon=lte.${maxLon}` +
    `&lat=gte.${minLat}&lat=lte.${maxLat}` +
    `&select=id,name,category,lon,lat&limit=1000`;

  let data: Hl[];
  try {
    const res = await fetch(url, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      next: { revalidate: 86400, tags: ["highlights"] },
    });
    if (!res.ok) return EMPTY;
    data = (await res.json()) as Hl[];
  } catch {
    return EMPTY;
  }

  const passed = (data ?? [])
    .map((hl) => {
      let best = Infinity;
      for (let i = 0; i < coords.length; i += 5) {
        const d = haversineKm(hl.lon, hl.lat, coords[i][0], coords[i][1]);
        if (d < best) best = d;
      }
      return { hl, offKm: best };
    })
    .filter((x) => x.offKm <= 0.25)
    .slice(0, 8);

  return {
    type: "FeatureCollection",
    features: passed.map(({ hl }) => ({
      type: "Feature",
      properties: { id: hl.id, name: hl.name, category: hl.category },
      geometry: { type: "Point", coordinates: [hl.lon, hl.lat] },
    })),
  };
}
