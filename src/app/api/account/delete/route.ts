import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// POST /api/account/delete — self-service account deletion (GDPR).
// The caller's OWN session determines who gets deleted; the service role
// is only the executor (auth.admin.deleteUser has no RLS path). All data
// cascades via FKs; community highlights survive with creator=null.
export async function POST() {
  const sb = supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = supabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "deletion_unavailable" }, { status: 503 });
  }

  // Storage first (no FK cascade covers buckets).
  for (const bucket of ["avatars", "highlight-photos"]) {
    const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 100 });
    if (files && files.length > 0) {
      await admin.storage
        .from(bucket)
        .remove(files.map((f) => `${user.id}/${f.name}`));
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
