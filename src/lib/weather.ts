// Open-Meteo forecast + rule-based packing tip (GEN-138, shared with the
// tour page in GEN-132). Server-side only — uses fetch with ISR caching.

export type Weather = {
  days: { date: string; tMax: number; tMin: number; rain: number }[];
  packTip: "rain" | "cold" | "heat" | null;
};

export async function getWeather(
  lon: number,
  lat: number,
): Promise<Weather | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=Europe%2FAmsterdam&forecast_days=5`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    const d = await res.json();
    const days = (d.daily?.time ?? []).map((date: string, i: number) => ({
      date,
      tMax: Math.round(d.daily.temperature_2m_max[i]),
      tMin: Math.round(d.daily.temperature_2m_min[i]),
      rain: d.daily.precipitation_probability_max[i] ?? 0,
    }));
    if (!days.length) return null;
    const packTip =
      days[0].rain >= 50
        ? "rain"
        : days[0].tMin <= 4
          ? "cold"
          : days[0].tMax >= 27
            ? "heat"
            : null;
    return { days, packTip };
  } catch {
    return null;
  }
}
