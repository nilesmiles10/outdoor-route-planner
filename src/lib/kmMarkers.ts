// Afstand-markers langs de route (GEN-137), gedeeld door de tour/trail-
// detailpagina en de planner zodat de indeling niet uit elkaar loopt.
//
// Adaptieve stap: met de oude vaste 5 km-stap kreeg een route < 5 km GÉÉN
// enkele marker (next=5000 > totaal) — juist wandelingen (3-8 km) verloren zo
// hun afstands-referentie op de kaart. Korte routes krijgen nu een fijnere
// stap; 15-100 km (5 km) en > 100 km (10 km) blijven ongewijzigd.
export function kmMarkerStepM(totalM: number): number {
  const km = totalM / 1000;
  if (km <= 6) return 1000;
  if (km <= 15) return 2000;
  if (km <= 100) return 5000;
  return 10000;
}

export function buildKmMarkers(
  coords: GeoJSON.Position[],
  distances: number[],
): GeoJSON.FeatureCollection | null {
  if (!coords.length || distances.length === 0) return null;
  const total = distances[distances.length - 1] ?? 0;
  const stepM = kmMarkerStepM(total);
  const features: GeoJSON.Feature[] = [];
  let next = stepM;
  for (let i = 0; i < distances.length && next < total; i++) {
    if ((distances[i] ?? 0) >= next) {
      const c = coords[i];
      if (c) {
        features.push({
          type: "Feature",
          properties: { label: String(Math.round(next / 1000)) },
          geometry: { type: "Point", coordinates: [c[0], c[1]] },
        });
      }
      next += stepM;
    }
  }
  return features.length ? { type: "FeatureCollection", features } : null;
}
