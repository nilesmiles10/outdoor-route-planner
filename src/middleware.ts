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

export default function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/admin")) {
    return adminSession(req);
  }
  return intl(req);
}

export const config = {
  // Skip api routes, embeds, Next internals and all static files
  matcher: ["/((?!api|embed|_next|_vercel|.*\\..*).*)"],
};
