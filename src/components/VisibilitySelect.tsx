"use client";

// Compact 4-staten zichtbaarheids-select; vervangt de oude 🌐/🔒-toggle
// op alle plekken waar een tour/collectie een visibility heeft.
import { useTranslations } from "next-intl";
import { VISIBILITIES, VISIBILITY_ICON, type Visibility } from "@/lib/visibility";

export default function VisibilitySelect({
  value,
  onChange,
  compact,
}: {
  value: Visibility;
  onChange: (v: Visibility) => void;
  compact?: boolean;
}) {
  const t = useTranslations("visibility");
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Visibility)}
      title={t(`hint.${value}` as never)}
      className={
        compact
          ? "max-w-24 rounded border border-neutral-200 bg-white px-1 py-0.5 text-[10px] text-neutral-600"
          : "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700"
      }
    >
      {VISIBILITIES.map((v) => (
        <option key={v} value={v}>
          {VISIBILITY_ICON[v]} {t(v)}
        </option>
      ))}
    </select>
  );
}
