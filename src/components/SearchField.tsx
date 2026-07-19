"use client";

import { useEffect, useRef, useState } from "react";
import type { Waypoint } from "./MapView";

type Suggestion = Waypoint & { label: string; type: string };

type Props = {
  placeholder: string;
  badge: string;
  badgeColor: string;
  value: Waypoint | null;
  onSelect: (wp: Waypoint | null) => void;
  onRemove?: () => void;
};

export default function SearchField({
  placeholder,
  badge,
  badgeColor,
  value,
  onSelect,
  onRemove,
}: Props) {
  const [text, setText] = useState(value?.name ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Sync input text when a waypoint is set programmatically (select/reverse).
  // Deliberately does NOT clear on value=null — the user may be mid-typing.
  useEffect(() => {
    if (value) setText(value.name);
  }, [value]);

  function handleChange(q: string) {
    setText(q);
    if (value) onSelect(null);
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSuggestions(data.results ?? []);
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 250);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 focus-within:border-emerald-600">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: badgeColor }}
        >
          {badge}
        </span>
        <input
          className="w-full text-sm outline-none placeholder:text-neutral-400"
          placeholder={placeholder}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 text-neutral-400 hover:text-red-600"
            aria-label="remove"
          >
            ×
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                onMouseDown={() => {
                  onSelect({ name: s.name, lon: s.lon, lat: s.lat });
                  setOpen(false);
                }}
              >
                <span className="font-medium">{s.name}</span>
                <span className="ml-2 text-xs text-neutral-500">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
