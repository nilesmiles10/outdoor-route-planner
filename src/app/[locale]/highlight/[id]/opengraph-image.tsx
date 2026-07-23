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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 24,
            opacity: 0.85,
          }}
        >
          <svg width="40" height="40" viewBox="0 0 512 512">
            <path d="M232 340 L330 200 L430 340 Z" fill="#a7f3d0" />
            <path d="M96 340 L212 150 L318 340 Z" fill="#ffffff" />
            <rect x="150" y="360" width="150" height="16" rx="8" fill="#ffffff" />
          </svg>
          <div style={{ fontSize: 28 }}>TARNOO</div>
        </div>
      </div>
    ),
    size,
  );
}
