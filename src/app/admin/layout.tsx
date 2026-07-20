import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdmin } from "@/lib/adminAuth";
import { getSiteSettings } from "@/lib/siteSettings";
import "../globals.css";

// Second root layout (multiple-root pattern, like /embed): no next-intl,
// single-language EN, noindex. Non-admins get a 404 — the route is not
// advertised. NOTE: this guard protects RENDERING only; every server
// action re-checks via requireAdmin().

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    title: `Admin | ${s.site_name}`,
    robots: { index: false, follow: false },
  };
}

const NAV: [string, string][] = [
  ["/admin", "Dashboard"],
  ["/admin/reports", "Reports"],
  ["/admin/users", "Users"],
  ["/admin/tours", "Tours"],
  ["/admin/highlights", "Highlights"],
  ["/admin/collections", "Collections"],
  ["/admin/settings", "Settings"],
  ["/admin/audit", "Audit log"],
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdmin();
  if (!admin) notFound();

  return (
    <html lang="en">
      <body className="antialiased bg-neutral-50">
        <div className="flex min-h-dvh">
          <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-neutral-200 bg-white p-4">
            <a href="/admin" className="mb-3 flex items-center gap-2 font-semibold text-emerald-800">
              <span aria-hidden>⛰</span> Admin
            </a>
            {NAV.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-lg px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
              >
                {label}
              </a>
            ))}
            <div className="mt-auto pt-4 text-[11px] text-neutral-400">
              {admin.user.email}
              <br />
              <a href="/nl" className="text-emerald-700 hover:underline">
                ← Back to site
              </a>
            </div>
          </aside>
          <main className="min-w-0 flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
