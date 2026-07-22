// GEN-143 — FIT-course-encoder via de officiële @garmin/fitsdk
// (cookbook "Encoding FIT Course Files": file_id → course → lap →
// event start → records+course_points → event stop). Dynamic import
// door de callers (bundle-lazy, zelfde patroon als fit-file-parser).
import { type Course, courseTimestamps } from "@/lib/course";

// FIT date_time = seconden sinds 1989-12-31T00:00:00Z; de SDK accepteert
// Date-objecten (zelfde vorm als de Decoder teruggeeft).
const SEMI = 2 ** 31 / 180;

const FIT_SPORT: Record<string, string> = {
  hike: "hiking",
  run: "running",
  touring: "cycling",
  gravel: "cycling",
  mtb: "cycling",
  road: "cycling",
  ebike: "cycling",
};

// FIT course_point.type kent alle richtingen (camelCase in de SDK).
const FIT_POINT: Record<string, string> = {
  straight: "straight",
  left: "left",
  right: "right",
  slight_left: "slightLeft",
  slight_right: "slightRight",
  sharp_left: "sharpLeft",
  sharp_right: "sharpRight",
  keep_left: "slightLeft",
  keep_right: "slightRight",
  uturn: "uTurn",
  roundabout: "generic",
};

export async function buildFitCourse(course: Course): Promise<Uint8Array> {
  const { Encoder, Profile } = await import("@garmin/fitsdk");
  const ts = courseTimestamps(course);
  // De SDK-typings voor onMesg zijn strenger dan wat de runtime accepteert
  // (velden per mesg-type); runtime is bewezen via de round-trip-test.
  type Enc = { onMesg: (n: number, m: Record<string, unknown>) => void; close: () => Uint8Array };
  const at = (i: number) => new Date(ts[i] ?? ts[0]);
  const lat = (i: number) => Math.round(course.coords[i][1] * SEMI);
  const lon = (i: number) => Math.round(course.coords[i][0] * SEMI);
  const lastI = course.coords.length - 1;
  const totalDist = course.cumDistM[lastI] ?? 0;

  const enc = new Encoder() as unknown as Enc;
  enc.onMesg(Profile.MesgNum.FILE_ID, {
    type: "course",
    manufacturer: "development",
    product: 0,
    timeCreated: at(0),
  });
  enc.onMesg(Profile.MesgNum.COURSE, {
    name: course.name.slice(0, 30),
    sport: FIT_SPORT[course.sport] ?? "cycling",
  });
  enc.onMesg(Profile.MesgNum.LAP, {
    startTime: at(0),
    timestamp: at(lastI),
    totalElapsedTime: course.durationS,
    totalTimerTime: course.durationS,
    totalDistance: totalDist,
    startPositionLat: lat(0),
    startPositionLong: lon(0),
    endPositionLat: lat(lastI),
    endPositionLong: lon(lastI),
  });
  enc.onMesg(Profile.MesgNum.EVENT, {
    timestamp: at(0),
    event: "timer",
    eventType: "start",
    eventGroup: 0,
  });

  // records en course_points chronologisch interleaven (cookbook-eis).
  let turnIdx = 0;
  for (let i = 0; i < course.coords.length; i++) {
    while (turnIdx < course.turns.length && course.turns[turnIdx].i <= i) {
      const t = course.turns[turnIdx];
      const name =
        t.t === "roundabout" && t.exit ? `Rotonde ${t.exit}` : undefined;
      enc.onMesg(Profile.MesgNum.COURSE_POINT, {
        timestamp: at(t.i),
        positionLat: lat(t.i),
        positionLong: lon(t.i),
        distance: course.cumDistM[t.i] ?? 0,
        type: FIT_POINT[t.t] ?? "generic",
        ...(name ? { name } : {}),
      });
      turnIdx++;
    }
    enc.onMesg(Profile.MesgNum.RECORD, {
      timestamp: at(i),
      positionLat: lat(i),
      positionLong: lon(i),
      altitude: course.elevation[i] ?? 0,
      distance: course.cumDistM[i] ?? 0,
    });
  }

  enc.onMesg(Profile.MesgNum.EVENT, {
    timestamp: at(lastI),
    event: "timer",
    eventType: "stopAll",
    eventGroup: 0,
  });
  return enc.close();
}
