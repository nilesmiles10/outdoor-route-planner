import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";

export type TourRow = {
  id: string;
  owner: string;
  name: string;
  visibility: "private" | "close_friends" | "followers" | "public";
  sport: string;
  waypoints: { name: string; lon: number; lat: number }[];
  geometry: GeoJSON.LineString;
  elevation: number[];
  stats: { distanceM: number; timeS: number; ascendM: number; descendM: number };
  surfaces: { buckets: { paved: number; unpaved: number; unknown: number } };
  updated_at: string;
  // GEN-117 activity columns (null on planned tours)
  kind: "planned" | "completed";
  recorded_at: string | null;
  duration_s: number | null;
  moving_s: number | null;
  max_speed_kmh: number | null;
  time_offsets: number[] | null;
  // Author attribution (Komoot teardown): joined via tours_owner_profiles_fkey.
  profile: { display_name: string | null; avatar_url: string | null } | null;
  // GEN-143: turn-instructies (null bij oude tours/uploads).
  turns: { i: number; t: string; exit?: number }[] | null;
  waytypes: Record<string, number> | null;
};

// cache() dedupt de query binnen één request: layout.tsx (bestaanscheck vóór
// de Suspense), page.tsx (render) én generateMetadata (og-tags) roepen getTour
// met dezelfde id — zonder cache 3 identieke round-trips, nu 1. Zelfde patroon
// als lib/siteSettings.
export const getTour = cache(async (id: string): Promise<TourRow | null> => {
  // Session-aware server client: anonymous visitors only see public rows;
  // a logged-in owner also sees their own private rows (RLS).
  const sb = supabaseServer();
  const { data } = await sb
    .from("tours")
    .select(
      "id,owner,name,visibility,sport,waypoints,geometry,elevation,stats,surfaces,waytypes,updated_at,kind,recorded_at,duration_s,moving_s,max_speed_kmh,time_offsets,turns,profile:profiles!tours_owner_profiles_fkey(display_name,avatar_url)",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as TourRow) ?? null;
});
