import { ImageResponse } from "next/og";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CATEGORY_EMOJI: Record<string, string> = {
  peak: "⛰️",
  viewpoint: "🔭",
  hut: "🛖",
  water: "💧",
  cafe: "☕",
  monument: "🏛️",
  nature: "🌳",
  other: "📍",
};

// OG card for highlight pages (GEN-138 follow-up): gradient + emoji + name.
export default async function OgImage({
  params,
}: {
  params: { id: string };
}) {
  const sb = supabaseServer();
  const { data: hl } = await sb
    .from("highlights")
    .select("name,category")
    .eq("id", params.id)
    .maybeSingle();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #059669 0%, #115e59 100%)",
          fontFamily: "sans-serif",
          color: "#fff",
        }}
      >
        <div style={{ fontSize: 120 }}>
          {CATEGORY_EMOJI[(hl?.category as string) ?? "other"] ?? "📍"}
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            marginTop: 24,
            maxWidth: 1000,
            textAlign: "center",
          }}
        >
          {((hl?.name as string) ?? "Highlight").slice(0, 50)}
        </div>
        <div style={{ fontSize: 28, marginTop: 24, opacity: 0.85 }}>
          OUTDOOR ROUTE PLANNER
        </div>
      </div>
    ),
    size,
  );
}
