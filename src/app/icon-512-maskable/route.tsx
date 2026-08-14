import { ImageResponse } from "next/og";

// Maskable PWA-icoon (Android adaptive icons): emerald tot de rand zodat elke
// launcher-mask (cirkel/squircle) schoon crop't zónder witte rand, met het
// Tarn-mark ruim binnen de safe-zone (~84% van het vlak → geen afgesneden
// pieken bij een cirkelmask). 512×512 voor scherpe weergave; los van de iOS
// apple-touch-icon (die iOS zelf afrondt).
export const runtime = "nodejs";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#047857",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="430" height="430" viewBox="0 0 512 512">
          <rect x="0" y="300" width="512" height="212" fill="#065f46" />
          <path d="M232 300 L330 172 L430 300 Z" fill="#a7f3d0" />
          <path d="M96 300 L212 128 L318 300 Z" fill="#ffffff" />
          <rect x="150" y="346" width="140" height="12" rx="6" fill="#ffffff" fillOpacity="0.42" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
