import { ImageResponse } from "next/og";

// iOS home-screen icon. iOS applies its own rounded-corner mask, so we fill
// the whole square with emerald and draw a flat Tarn mark (peaks over the
// tarn) — no gradient, since Satori's gradient support is unreliable.
export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#047857" }}>
        <svg width="180" height="180" viewBox="0 0 512 512">
          <rect x="0" y="300" width="512" height="212" fill="#065f46" />
          <path d="M232 300 L330 172 L430 300 Z" fill="#a7f3d0" />
          <path d="M96 300 L212 128 L318 300 Z" fill="#ffffff" />
          <rect x="150" y="346" width="140" height="12" rx="6" fill="#ffffff" fillOpacity="0.42" />
        </svg>
      </div>
    ),
    size,
  );
}
