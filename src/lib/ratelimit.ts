import "server-only";
import { createClient } from "@supabase/supabase-js";

// Rate limiting for the public geo proxy (fase E). Two backends:
// 1. Upstash Redis (sliding-ish fixed window) when UPSTASH_REDIS_REST_URL/
//    TOKEN are configured — the standard serverless answer.
// 2. Postgres fixed-window RPC (rl_hit) otherwise — zero extra services,
//    active from day one; one cheap upsert per request.
// Always FAIL-OPEN: a broken limiter must never take the planner down.

export type LimitResult = { allowed: boolean; retryAfterS: number };

const WINDOW_S = 60;

async function hitUpstash(key: string): Promise<number | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const window = Math.floor(Date.now() / 1000 / WINDOW_S);
    const k = `rl:${key}:${window}`;
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify([
        ["INCR", k],
        ["EXPIRE", k, String(WINDOW_S * 2)],
      ]),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result: number }[];
    return data[0]?.result ?? null;
  } catch {
    return null;
  }
}

async function hitPostgres(key: string): Promise<number | null> {
  try {
    // Next 14 gotcha (empirisch): in een GET route handler belanden ook
    // POST-fetches in de Data Cache — de eerste rl_hit-respons ("1") werd
    // eindeloos herhaald en de teller liep nooit op. cache:"no-store" op
    // de client-fetch is de canonieke fix.
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false },
        global: {
          fetch: (url, opts) => fetch(url, { ...opts, cache: "no-store" }),
        },
      },
    );
    const { data, error } = await sb.rpc("rl_hit", {
      p_key: key,
      p_window_seconds: WINDOW_S,
    });
    if (error) return null;
    return data as number;
  } catch {
    return null;
  }
}

export async function checkLimit(
  bucket: string,
  ip: string,
  limitPerMinute: number,
): Promise<LimitResult> {
  const key = `${bucket}:${ip}`;
  const count = (await hitUpstash(key)) ?? (await hitPostgres(key));
  if (count === null) return { allowed: true, retryAfterS: 0 }; // fail-open
  if (count <= limitPerMinute) return { allowed: true, retryAfterS: 0 };
  const nextWindow = (Math.floor(Date.now() / 1000 / WINDOW_S) + 1) * WINDOW_S;
  return {
    allowed: false,
    retryAfterS: Math.max(1, nextWindow - Math.floor(Date.now() / 1000)),
  };
}

export function clientIp(req: Request): string {
  // First hop of x-forwarded-for is the client on Vercel.
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}
