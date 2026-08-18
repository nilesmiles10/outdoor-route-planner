import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client for route handlers / server components.
export function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => {
          try {
            all.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — middleware refreshes sessions
          }
        },
      },
    },
  );
}

// Sessieloze anon-client voor PUBLIEKE server-renders.
//
// Waarom naast supabaseServer(): die leest cookies, dus z'n uitkomst hangt af
// van wie er kijkt. Voor /trails betekende dat concreet dat een ingelogde
// admin de verborgen trails (hidden_at) meekreeg — trails_select is
// "hidden_at IS NULL OR is_admin()". Zo'n render mag je nooit in een gedeelde
// CDN-cache stoppen: dan serveer je de admin-versie aan iedereen.
//
// Deze client stuurt geen sessie mee, dus elke bezoeker krijgt exact dezelfde
// rijen en de render is veilig cachebaar. Gebruik 'm voor publieke, niet
// viewer-specifieke content; gebruik supabaseServer() zodra de uitkomst wél
// van de ingelogde gebruiker mag afhangen.
export function supabasePublic() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
