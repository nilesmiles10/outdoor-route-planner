"use client";

// Regio-filter als dropdown i.p.v. chips wanneer een land veel regio's heeft
// (GB 149, IT 110, FR 97, …) — 100+ chips is een onbruikbare muur. De select
// houdt álle regio's bereikbaar en compact; navigeren gebeurt bij wijziging.
export default function RegionFilterSelect({
  options,
  current,
  allLabel,
  allHref,
}: {
  options: { region: string; href: string }[];
  current: string;
  allLabel: string;
  allHref: string;
}) {
  return (
    <select
      value={current}
      onChange={(e) => {
        const val = e.target.value;
        const href =
          val === "all" ? allHref : options.find((o) => o.region === val)?.href;
        if (href) window.location.href = href;
      }}
      className="mt-2 w-full max-w-xs rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-700"
    >
      <option value="all">{allLabel}</option>
      {options.map((o) => (
        <option key={o.region} value={o.region}>
          {o.region}
        </option>
      ))}
    </select>
  );
}
