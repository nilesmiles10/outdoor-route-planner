// Open-Meteo forecast + rule-based packing tip (GEN-138, shared with the
// tour page in GEN-132). Server-side only — uses fetch with ISR caching.

export type Weather = {
  days: { date: string; tMax: number; tMin: number; rain: number; code: number }[];
  packTip: "storm" | "snow" | "rain" | "cold" | "heat" | null;
};

// WMO weather-interpretation-code → emoji. Voegt de daadwerkelijke conditie toe
// (sneeuw/mist/onweer zeggen meer dan alleen neerslagkans). Codes: open-meteo.com.
export function wmoEmoji(code: number): string {
  if (code === 0) return "☀️"; // helder
  if (code <= 2) return "🌤️"; // (bijna) helder / half bewolkt
  if (code === 3) return "☁️"; // bewolkt
  if (code <= 48) return "🌫️"; // mist
  if (code <= 57) return "🌦️"; // motregen
  if (code <= 67) return "🌧️"; // regen
  if (code <= 77) return "❄️"; // sneeuw
  if (code <= 82) return "🌧️"; // regenbuien
  if (code <= 86) return "❄️"; // sneeuwbuien
  return "⛈️"; // onweer (95-99)
}

export async function getWeather(
  lon: number,
  lat: number,
): Promise<Weather | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
      // timezone=auto: dag-grenzen + "vandaag" volgen de LOKALE tijd van de
      // route, niet die van Amsterdam. Voor de pan-Europese dataset (UK/GMT,
      // Iberië/WET, Griekenland+Baltische staten/EET) klopte de dag-indeling
      // en de pack-tip-"vandaag" anders 1-2 uur niet.
      `&timezone=auto&forecast_days=5`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    const d = await res.json();
    const days = (d.daily?.time ?? []).map((date: string, i: number) => ({
      date,
      tMax: Math.round(d.daily.temperature_2m_max[i]),
      tMin: Math.round(d.daily.temperature_2m_min[i]),
      rain: d.daily.precipitation_probability_max[i] ?? 0,
      code: d.daily.weathercode?.[i] ?? 0,
    }));
    if (!days.length) return null;
    // Conditie-code weegt vóór temp/regen: onweer en sneeuw veranderen radicaal
    // wat je meeneemt. Codes 95-99 = onweer; 71-77 + 85-86 = (buien met) sneeuw.
    const c = days[0].code;
    const packTip: Weather["packTip"] =
      c >= 95
        ? "storm"
        : (c >= 71 && c <= 77) || c === 85 || c === 86
          ? "snow"
          : days[0].rain >= 50
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
