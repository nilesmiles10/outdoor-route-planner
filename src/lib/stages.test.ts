import { describe, expect, it } from "vitest";
import { splitIntoStages, suggestDays, dayKmFor } from "./stages";

// A synthetic 4 km route: 5 points, 1 km apart, with a known elevation shape.
const coords: GeoJSON.Position[] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
];
const cumDist = [0, 1000, 2000, 3000, 4000];
const elevation = [0, 100, 150, 120, 200];
const TIME = 3600; // 1 h for the whole route

describe("suggestDays", () => {
  it("rounds total/target to a day count, floor 1", () => {
    expect(suggestDays(40000, 20)).toBe(2);
    expect(suggestDays(100000, 20)).toBe(5);
    expect(suggestDays(5000, 20)).toBe(1); // rounds to 0 -> clamped to 1
    expect(suggestDays(0, 20)).toBe(1);
    expect(suggestDays(40000, 0)).toBe(1);
  });
});

describe("dayKmFor", () => {
  it("knows sports and falls back", () => {
    expect(dayKmFor("hike")).toBe(20);
    expect(dayKmFor("road")).toBe(110);
    expect(dayKmFor("unknown-sport")).toBe(25);
  });
});

describe("splitIntoStages", () => {
  it("returns a single stage for nDays=1", () => {
    const s = splitIntoStages(coords, elevation, cumDist, TIME, 1);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ startIdx: 0, endIdx: 4, distanceM: 4000 });
    expect(s[0].timeS).toBeCloseTo(3600);
  });

  it("splits into two balanced stages at the midpoint", () => {
    const s = splitIntoStages(coords, elevation, cumDist, TIME, 2);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ day: 1, startIdx: 0, endIdx: 2, distanceM: 2000 });
    expect(s[1]).toMatchObject({ day: 2, startIdx: 2, endIdx: 4, distanceM: 2000 });
    // time is proportional to distance
    expect(s[0].timeS).toBeCloseTo(1800);
    expect(s[1].timeS).toBeCloseTo(1800);
  });

  it("computes per-stage ascent/descent from the elevation slice", () => {
    const [a, b] = splitIntoStages(coords, elevation, cumDist, TIME, 2);
    // stage 1: 0 -> 100 -> 150  => +150, -0
    expect(a.ascentM).toBe(150);
    expect(a.descentM).toBe(0);
    // stage 2: 150 -> 120 -> 200 => +80, -30
    expect(b.ascentM).toBe(80);
    expect(b.descentM).toBe(30);
  });

  it("is contiguous and covers the whole route", () => {
    const s = splitIntoStages(coords, elevation, cumDist, TIME, 3);
    expect(s[0].startIdx).toBe(0);
    expect(s[s.length - 1].endIdx).toBe(coords.length - 1);
    for (let i = 1; i < s.length; i++) {
      expect(s[i].startIdx).toBe(s[i - 1].endIdx); // no gaps/overlaps
    }
    const sum = s.reduce((t, x) => t + x.distanceM, 0);
    expect(sum).toBeCloseTo(4000);
  });

  it("never produces a zero-length stage and caps days at segment count", () => {
    // 3 points = 2 segments; asking for 5 days yields at most 2 stages.
    const c: GeoJSON.Position[] = [[0, 0], [0, 1], [0, 2]];
    const s = splitIntoStages(c, [0, 10, 20], [0, 1000, 2000], 600, 5);
    expect(s.length).toBe(2);
    for (const stage of s) expect(stage.endIdx).toBeGreaterThan(stage.startIdx);
  });

  it("handles degenerate input", () => {
    expect(splitIntoStages([[0, 0]], [0], [0], 0, 2)).toEqual([]);
    expect(splitIntoStages(coords, elevation, cumDist, TIME, 0)).toEqual([]);
  });
});
