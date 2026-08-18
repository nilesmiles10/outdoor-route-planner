import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdmin } from "@/lib/adminAuth";
import { getSiteSettings } from "@/lib/siteSettings";
import AdminAccount from "@/components/admin/AdminAccount";
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
  ["/admin/trails", "Trails"],
  ["/admin/highlights", "Highlights"],
  ["/admin/collections", "Collections"],
  ["/admin/pages", "Pages"],
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
        {/* Mobiele topbalk: de vaste 208px-sidebar vrat op een telefoon meer
            dan de helft van de breedte. <details> i.p.v. state — dit is een
            server component, dus zonder client-JS. */}
        <details className="group border-b border-neutral-200 bg-white md:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2 font-semibold text-emerald-800">
              <span aria-hidden>⛰</span> Admin
            </span>
            <span className="text-neutral-400 group-open:hidden">☰</span>
            <span className="hidden text-neutral-400 group-open:inline">✕</span>
          </summary>
          <nav className="flex flex-col border-t border-neutral-100 pb-2">
            {NAV.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {label}
              </a>
            ))}
            <div className="px-4">
              <AdminAccount />
            </div>
          </nav>
        </details>

        <div className="flex min-h-dvh">
          <aside className="hidden w-52 shrink-0 flex-col gap-1 border-r border-neutral-200 bg-white p-4 md:flex">
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
            <AdminAccount />
          </aside>
          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
