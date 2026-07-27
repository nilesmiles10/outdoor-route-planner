import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

// /admin lives outside the locale tree (like /embed) and needs a Supabase
// session-refresh pass: server components can't write cookies, so without
// this an expired access token would lock the admin out until a client-side
// navigation refreshes it.
async function adminSession(req: NextRequest): Promise<NextResponse> {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (all) => {
          all.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          all.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  // getUser() validates the token server-side and triggers a refresh when
  // it is expired; the refreshed cookies land on the response above.
  await supabase.auth.getUser();
  return res;
}

// Consolidate all traffic onto the canonical apex host. www and the old
// Vercel production alias 301 -> tarnoo.com so search engines don't index
// duplicates. Scoped to an explicit allowlist: preview deployments
// (outdoor-route-planner-<hash>-*.vercel.app) are never redirected.
const CANONICAL_HOST = "tarnoo.com";
const REDIRECT_HOSTS = new Set([
  "www.tarnoo.com",
  "outdoor-route-planner-seven.vercel.app",
]);

export default function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (REDIRECT_HOSTS.has(host)) {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 301);
  }
  if (req.nextUrl.pathname.startsWith("/admin")) {
    return adminSession(req);
  }
  // routing.localeCookie is off so that locale pages never set a cookie —
  // a response with Set-Cookie can't be CDN-cached, which kept every trail
  // URL at x-vercel-cache: MISS. next-intl therefore ignores a saved
  // language preference, so honour it here instead. Only the bare "/"
  // redirect is affected, and a redirect is not a cacheable content page.
  if (req.nextUrl.pathname === "/") {
    const saved = req.cookies.get("NEXT_LOCALE")?.value;
    if (saved && (routing.locales as readonly string[]).includes(saved)) {
      const url = req.nextUrl.clone();
      url.pathname = `/${saved}`;
      return NextResponse.redirect(url);
    }
  }
  return intl(req);
}

export const config = {
  // Skip api routes, embeds, Next internals and all static files
  matcher: ["/((?!api|embed|_next|_vercel|apple-icon|.*\\..*).*)"],
};
