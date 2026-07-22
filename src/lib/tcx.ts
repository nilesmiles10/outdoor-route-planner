// GEN-143 — TCX-course-export (TrainingCenterDatabase v2), hand-XML
// zoals gpx.ts. Garmin Connect/Wahoo importeren dit als Course met
// CoursePoints (turn-by-turn). CoursePoint-namen max 10 tekens (spec).
import { type Course, courseTimestamps } from "@/lib/course";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// TCX kent alleen Left/Right/Straight/Generic als richtingtypen.
const TCX_POINT: Record<string, { type: string; name: string }> = {
  straight: { type: "Straight", name: "Rechtdoor" },
  left: { type: "Left", name: "Links" },
  slight_left: { type: "Left", name: "Half links" },
  sharp_left: { type: "Left", name: "Sch. links" },
  keep_left: { type: "Left", name: "Links aanh" },
  right: { type: "Right", name: "Rechts" },
  slight_right: { type: "Right", name: "Half rechts" },
  sharp_right: { type: "Right", name: "Sch rechts" },
  keep_right: { type: "Right", name: "Rechts aanh" },
  uturn: { type: "Generic", name: "U-bocht" },
  roundabout: { type: "Generic", name: "Rotonde" },
};

export function buildTcx(course: Course): string {
  const ts = courseTimestamps(course);
  const iso = (ms: number) => new Date(ms).toISOString();
  const first = course.coords[0];
  const last = course.coords[course.coords.length - 1];
  const totalDist = course.cumDistM[course.cumDistM.length - 1] ?? 0;

  const trackpoints = course.coords
    .map((c, i) => {
      const ele =
        course.elevation[i] !== undefined
          ? `<AltitudeMeters>${course.elevation[i].toFixed(1)}</AltitudeMeters>`
          : "";
      return `        <Trackpoint>
          <Time>${iso(ts[i] ?? ts[0])}</Time>
          <Position><LatitudeDegrees>${c[1].toFixed(6)}</LatitudeDegrees><LongitudeDegrees>${c[0].toFixed(6)}</LongitudeDegrees></Position>
          ${ele}<DistanceMeters>${(course.cumDistM[i] ?? 0).toFixed(1)}</DistanceMeters>
        </Trackpoint>`;
    })
    .join("\n");

  const coursePoints = course.turns
    .map((t) => {
      const p = TCX_POINT[t.t] ?? { type: "Generic", name: "Let op" };
      const name = t.t === "roundabout" && t.exit ? `Rotonde ${t.exit}` : p.name;
      const c = course.coords[t.i];
      if (!c) return "";
      return `      <CoursePoint>
        <Name>${esc(name.slice(0, 10))}</Name>
        <Time>${iso(ts[t.i] ?? ts[0])}</Time>
        <Position><LatitudeDegrees>${c[1].toFixed(6)}</LatitudeDegrees><LongitudeDegrees>${c[0].toFixed(6)}</LongitudeDegrees></Position>
        <PointType>${p.type}</PointType>
      </CoursePoint>`;
    })
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Courses>
    <Course>
      <Name>${esc(course.name.slice(0, 15))}</Name>
      <Lap>
        <TotalTimeSeconds>${course.durationS.toFixed(1)}</TotalTimeSeconds>
        <DistanceMeters>${totalDist.toFixed(1)}</DistanceMeters>
        <BeginPosition><LatitudeDegrees>${first[1].toFixed(6)}</LatitudeDegrees><LongitudeDegrees>${first[0].toFixed(6)}</LongitudeDegrees></BeginPosition>
        <EndPosition><LatitudeDegrees>${last[1].toFixed(6)}</LatitudeDegrees><LongitudeDegrees>${last[0].toFixed(6)}</LongitudeDegrees></EndPosition>
        <Intensity>Active</Intensity>
      </Lap>
      <Track>
${trackpoints}
      </Track>
${coursePoints}
    </Course>
  </Courses>
</TrainingCenterDatabase>
`;
}
