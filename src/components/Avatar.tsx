// Shared avatar: photo when set, initials fallback (GEN-118).
export default function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string | null;
  url: string | null;
  size?: number;
}) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? ""}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-emerald-700 font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}
