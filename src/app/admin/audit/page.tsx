import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

// Append-only audit trail viewer (fase A). Filter via ?action= / ?type=.
export default async function AuditPage({
  searchParams,
}: {
  searchParams: { action?: string; type?: string };
}) {
  const { sb } = await requireAdmin();
  let q = sb
    .from("admin_audit")
    .select("id,actor,action,subject_type,subject_id,meta,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (searchParams.action) q = q.eq("action", searchParams.action);
  if (searchParams.type) q = q.eq("subject_type", searchParams.type);
  const { data } = await q;
  const rows = data ?? [];

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Audit log</h1>
      <p className="mt-1 text-xs text-neutral-500">
        Append-only — every admin mutation lands here. Filter with ?action=… or ?type=…
      </p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-400">
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Meta</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-neutral-400">
                  No entries.
                </td>
              </tr>
            )}
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-neutral-100 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-500">
                  {new Date(a.created_at).toLocaleString("nl-NL")}
                </td>
                <td className="px-3 py-2 font-medium text-neutral-800">{a.action}</td>
                <td className="px-3 py-2 text-neutral-600">
                  {a.subject_type} <span className="text-xs text-neutral-400">{a.subject_id}</span>
                </td>
                <td className="max-w-[24rem] truncate px-3 py-2 text-xs text-neutral-500">
                  {JSON.stringify(a.meta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
