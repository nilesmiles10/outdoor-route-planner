// GEN-143 — gedeeld course-model voor TCX/FIT-export (en later de
// Garmin Courses-API-push). Bron: opgeslagen tour-props of het live
// planner-resultaat; turns komen uit BRouter-voicehints (nullable —
// oude tours en uploads hebben er geen, dan geen course points).
import { cumulativeDistances } from "@/lib/elevation";

export type CourseTurn = { i: number; t: string; exit?: number };

export type Course = {
  name: string;
  sport: string; // app-sportcode (hike/run/touring/gravel/mtb/road/ebike)
  coords: GeoJSON.Position[];
  elevation: number[];
  cumDistM: number[];
  durationS: number; // virtual-partner tijdsbasis
  turns: CourseTurn[];
};

export function buildCourse(input: {
  name: string;
  sport: string;
  coords: GeoJSON.Position[];
  elevation: number[];
  durationS: number;
  turns?: CourseTurn[] | null;
}): Course {
  const cumDistM = cumulativeDistances(input.coords);
  const maxI = input.coords.length - 1;
  const turns = (input.turns ?? [])
    .filter((t) => Number.isInteger(t.i) && t.i > 0 && t.i <= maxI && typeof t.t === "string")
    .sort((a, b) => a.i - b.i);
  return {
    name: input.name,
    sport: input.sport,
    coords: input.coords,
    elevation: input.elevation,
    cumDistM,
    durationS: Math.max(60, Math.round(input.durationS) || 3600),
    turns,
  };
}

// Virtuele timestamps (ms) per punt, afstand-proportioneel over durationS.
// Vaste startdatum: exports zijn deterministisch en diff-baar.
export const COURSE_EPOCH_MS = Date.UTC(2026, 0, 1, 9, 0, 0);

export function courseTimestamps(course: Course): number[] {
  const total = course.cumDistM[course.cumDistM.length - 1] || 1;
  return course.cumDistM.map(
    (d) => COURSE_EPOCH_MS + Math.round((d / total) * course.durationS * 1000),
  );
}

// Turn-enum → per-format labels/typen gebeurt in tcx.ts / fitCourse.ts.
export const TURN_TYPES = [
  "straight",
  "left",
  "right",
  "slight_left",
  "slight_right",
  "sharp_left",
  "sharp_right",
  "keep_left",
  "keep_right",
  "uturn",
  "roundabout",
] as const;
