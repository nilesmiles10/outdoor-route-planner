import { requireAdmin } from "@/lib/adminAuth";
import {
  resolveReport,
  softDeleteComment,
  unpublishTour,
  suspendUser,
} from "@/app/admin/actions";
import ConfirmButton from "@/components/admin/ConfirmButton";

export const dynamic = "force-dynamic";

// Moderation queue (fase B): open reports with an inline subject preview
// and one-click actions. The subject rows are fetched with the admin
// session, so even suspended/private content shows up here via the
// is_admin() policies where they exist (and via owner-agnostic reads
// where the content is public).

type Report = {
  id: string;
  subject_type: "tour" | "comment" | "profile";
  subject_id: string;
  reporter: string;
  reason: string;
  status: string;
  resolution_note: string | null;
  created_at: string;
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const { sb } = await requireAdmin();
  const status = searchParams.status ?? "open";
  const { data } = await sb
    .from("reports")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: true })
    .limit(100);
  const reports = (data ?? []) as Report[];

  // Subject previews, fetched in bulk per type.
  const tourIds = reports.filter((r) => r.subject_type === "tour").map((r) => r.subject_id);
  const commentIds = reports.filter((r) => r.subject_type === "comment").map((r) => r.subject_id);
  const profileIds = [
    ...reports.filter((r) => r.subject_type === "profile").map((r) => r.subject_id),
    ...reports.map((r) => r.reporter),
  ];
  const [tours, comments, profiles] = await Promise.all([
    tourIds.length
      ? sb.from("tours").select("id,name,owner,visibility").in("id", tourIds)
      : { data: [] },
    commentIds.length
      ? sb.from("tour_comments").select("id,body,author,tour_id,deleted_at").in("id", commentIds)
      : { data: [] },
    profileIds.length
      ? sb.from("profiles").select("id,display_name,suspended_at").in("id", profileIds)
      : { data: [] },
  ]);
  const tourById = new Map((tours.data ?? []).map((t) => [t.id, t]));
  const commentById = new Map((comments.data ?? []).map((c) => [c.id, c]));
  const profileById = new Map((profiles.data ?? []).map((p) => [p.id, p]));

  const tabs = ["open", "resolved", "dismissed"];

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Reports</h1>
      <div className="mt-3 flex gap-1">
        {tabs.map((t) => (
          <a
            key={t}
            href={`/admin/reports?status=${t}`}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
              status === t ? "bg-neutral-800 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {t}
          </a>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {reports.length === 0 && (
          <p className="text-sm text-neutral-400">No {status} reports.</p>
        )}
        {reports.map((r) => {
          const reporter = profileById.get(r.reporter);
          const tour = r.subject_type === "tour" ? tourById.get(r.subject_id) : null;
          const comment = r.subject_type === "comment" ? commentById.get(r.subject_id) : null;
          const profile = r.subject_type === "profile" ? profileById.get(r.subject_id) : null;
          // The user to suspend, depending on subject type
          const offender =
            r.subject_type === "profile"
              ? r.subject_id
              : r.subject_type === "comment"
                ? comment?.author
                : tour?.owner;
          return (
            <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-neutral-600">
                  {r.subject_type}
                </span>
                <span className="text-neutral-900">“{r.reason}”</span>
                <span className="ml-auto shrink-0 text-xs text-neutral-400">
                  by {reporter?.display_name ?? r.reporter.slice(0, 8)} ·{" "}
                  {new Date(r.created_at).toLocaleString("nl-NL")}
                </span>
              </div>

              <div className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                {tour && (
                  <>
                    🗺 <a className="font-medium hover:underline" href={`/nl/tour/${tour.id}`} target="_blank">{tour.name}</a>
                    <span className="ml-2 text-xs text-neutral-400">({tour.visibility})</span>
                  </>
                )}
                {comment && (
                  <>
                    💬 <span className="italic">“{comment.body.slice(0, 200)}”</span>
                    {comment.deleted_at && <span className="ml-2 text-xs text-red-500">already removed</span>}
                  </>
                )}
                {profile && (
                  <>
                    👤 <a className="font-medium hover:underline" href={`/admin/users/${profile.id}`}>{profile.display_name ?? profile.id.slice(0, 8)}</a>
                    {profile.suspended_at && <span className="ml-2 text-xs text-red-500">suspended</span>}
                  </>
                )}
                {!tour && !comment && !profile && (
                  <span className="text-neutral-400">subject no longer exists</span>
                )}
              </div>

              {status === "open" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {comment && !comment.deleted_at && (
                    <form action={softDeleteComment}>
                      <input type="hidden" name="id" value={r.subject_id} />
                      <ConfirmButton label="Remove comment" message="Soft-delete this comment?" />
                    </form>
                  )}
                  {tour && tour.visibility === "public" && (
                    <form action={unpublishTour}>
                      <input type="hidden" name="id" value={r.subject_id} />
                      <ConfirmButton label="Unpublish tour" message="Set this tour to private?" />
                    </form>
                  )}
                  {offender && (
                    <form action={suspendUser}>
                      <input type="hidden" name="id" value={offender} />
                      <ConfirmButton
                        label="Suspend user"
                        message="Suspend this user? Their public content disappears and login is blocked."
                      />
                    </form>
                  )}
                  <form action={resolveReport} className="ml-auto flex items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      name="note"
                      placeholder="note (optional)"
                      className="rounded border border-neutral-200 px-2 py-1 text-xs"
                    />
                    <button
                      type="submit"
                      name="status"
                      value="resolved"
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                    >
                      Resolve
                    </button>
                    <button
                      type="submit"
                      name="status"
                      value="dismissed"
                      className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                    >
                      Dismiss
                    </button>
                  </form>
                </div>
              )}
              {r.resolution_note && (
                <p className="mt-2 text-xs text-neutral-500">Note: {r.resolution_note}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
