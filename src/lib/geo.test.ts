import { describe, expect, it } from "vitest";
import {
  SPORT_PROFILES,
  isSport,
  sportFamily,
  surfaceBucket,
  type Sport,
} from "./geo";

// First routing-layer regression suite (ROUTING_GAPS.md — the audit found none).
// Pure unit tests: they lock the profile→activity invariants and the surface
// parsing that drives the paved/unpaved breakdown on every route. No network.

const SPORTS: Sport[] = [
  "hike",
  "run",
  "touring",
  "gravel",
  "mtb",
  "road",
  "ebike",
];

describe("SPORT_PROFILES", () => {
  it("every advertised activity resolves to a BRouter profile", () => {
    for (const s of SPORTS) {
      expect(SPORT_PROFILES[s], `${s} must map to a profile`).toBeTruthy();
      expect(isSport(s)).toBe(true);
    }
    expect(isSport("nonsense")).toBe(false);
    expect(isSport("")).toBe(false);
  });

  // The five distinct-intent activities must stay on distinct profiles — a guard
  // against an accidental alias regression (e.g. someone remapping mtb→trekking).
  // Reproduced 2026-08-29: on the same Bolzano→Merano A→B these five returned
  // different length/ascend/geometry from BRouter.
  // All 7 activities now have their own profile — no aliases left (GEN-104:
  // ebike and run got dedicated profiles). Guards against an accidental
  // regression that re-aliases an activity.
  it("every activity uses a distinct profile", () => {
    const profiles = SPORTS.map((s) => SPORT_PROFILES[s]);
    expect(new Set(profiles).size).toBe(SPORTS.length);
  });

  it("ebike and run have their own profiles (GEN-104)", () => {
    expect(SPORT_PROFILES.ebike).toBe("ebike");
    expect(SPORT_PROFILES.ebike).not.toBe(SPORT_PROFILES.touring);
    expect(SPORT_PROFILES.run).toBe("run");
    expect(SPORT_PROFILES.run).not.toBe(SPORT_PROFILES.hike);
  });
});

describe("sportFamily", () => {
  it("groups foot vs bike", () => {
    expect(sportFamily("hike")).toBe("foot");
    expect(sportFamily("run")).toBe("foot");
    for (const s of ["touring", "gravel", "mtb", "road", "ebike"]) {
      expect(sportFamily(s)).toBe("bike");
    }
  });
});

describe("surfaceBucket", () => {
  it("classifies common paved/unpaved surfaces", () => {
    expect(surfaceBucket("asphalt")).toBe("paved");
    expect(surfaceBucket("concrete")).toBe("paved");
    expect(surfaceBucket("sett")).toBe("paved");
    expect(surfaceBucket("gravel")).toBe("unpaved");
    expect(surfaceBucket("ground")).toBe("unpaved");
    expect(surfaceBucket("sand")).toBe("unpaved");
    expect(surfaceBucket(undefined)).toBe("unknown");
    expect(surfaceBucket("teleporter")).toBe("unknown");
  });

  // Composite/variant tags must reduce to their base — the fix that stopped
  // hundreds of km of "unhewn_cobblestone" / "paving_stones:lanes" being counted
  // as "unknown" on the surface bar.
  it("reduces composite/variant tags to their base", () => {
    expect(surfaceBucket("gravel;ground")).toBe("unpaved");
    expect(surfaceBucket("dirt/sand")).toBe("unpaved");
    expect(surfaceBucket("asphalt:lanes")).toBe("paved");
    expect(surfaceBucket("concrete:plates")).toBe("paved");
    expect(surfaceBucket("paving_stones:30")).toBe("paved");
  });
});
