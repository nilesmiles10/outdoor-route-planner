import type { Metadata } from "next";
import "../globals.css";

// GEN-135 — second root layout (same multiple-root pattern as [locale]):
// embeds render bare, without header or intl provider, and are noindex —
// the canonical content lives on the tour page.

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
