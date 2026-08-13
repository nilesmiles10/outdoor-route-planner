"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Waypoint } from "./MapView";

type Suggestion = Waypoint & { label: string; type: string };
// Zichtbare status van de geocoder-lookup. Zonder dit bleef een 503 (Photon
// down) of een lege trefferlijst volledig stil: de dropdown rende alleen bij
// >0 suggesties, dus wie een plaats tikte zag niks — geen spinner, geen "niets
// gevonden", geen "niet beschikbaar". Nu geeft elk pad feedback.
type SearchStatus = "idle" | "loading" | "results" | "empty" | "error" | "rateLimited";

type Props = {
  placeholder: string;
  badge: string;
  badgeColor: string;
  value: Waypoint | null;
  onSelect: (wp: Waypoint | null) => void;
  onRemove?: () => void;
  // Komoot-style row actions (GEN-141 A2), shown on hover.
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRename?: (name: string) => void;
  actionLabels?: { remove: string; up: string; down: string; rename: string };
};

export default function SearchField({
  placeholder,
  badge,
  badgeColor,
  value,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
  onRename,
  actionLabels,
}: Props) {
  const ts = useTranslations("planner.search");
  const [text, setText] = useState(value?.name ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [open, setOpen] = useState(false);
  // Rename mode: typing edits the waypoint's label, no geocoder search.
  const [renaming, setRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // True when WE cleared the value because the user is retyping — that null
  // must not wipe the input. External nulls (map-balloon remove, undo) must.
  const typingRef = useRef(false);

  // Sync input text when the waypoint changes programmatically.
  useEffect(() => {
    if (value) {
      setText(value.name);
    } else if (typingRef.current) {
      typingRef.current = false; // user is mid-typing — keep their text
    } else {
      setText(""); // removed externally — clear the field
    }
  }, [value]);

  function handleChange(q: string) {
    setText(q);
    if (renaming) return; // rename mode: no search, no value clearing
    if (value) {
      typingRef.current = true;
      onSelect(null);
    }
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      setStatus("idle");
      setOpen(false);
      return;
    }
    // Toon meteen de loading-staat zodat het paneel niet leeg blijft tijdens
    // de debounce + fetch (anders lijkt zoeken "kapot" bij trage geocoder).
    setStatus("loading");
    setOpen(true);
    // Vang deze fetch af tegen een latere: een trage vroege response mag geen
    // verse resultaten overschrijven (last-write-wins op de eigen query).
    const myQuery = q;
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`);
        // input is intussen verder getikt — laat de nieuwere call winnen
        if (inputRef.current && inputRef.current.value !== myQuery) return;
        if (!res.ok) {
          setSuggestions([]);
          setStatus(res.status === 429 ? "rateLimited" : "error");
          setOpen(true);
          return;
        }
        const data = await res.json();
        const results: Suggestion[] = data.results ?? [];
        setSuggestions(results);
        setStatus(results.length ? "results" : "empty");
        setOpen(true);
      } catch {
        setSuggestions([]);
        setStatus("error");
        setOpen(true);
      }
    }, 250);
  }

  function commitRename() {
    if (!renaming) return;
    setRenaming(false);
    const name = text.trim();
    if (name && value && name !== value.name) onRename?.(name);
    else if (value) setText(value.name);
  }

  return (
    <div className="group relative">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 focus-within:border-emerald-600">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: badgeColor }}
        >
          {badge}
        </span>
        <input
          ref={inputRef}
          className="w-full text-sm outline-none placeholder:text-neutral-400"
          placeholder={placeholder}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() =>
            !renaming && (suggestions.length > 0 || status !== "idle") && setOpen(true)
          }
          onBlur={() => {
            setTimeout(() => setOpen(false), 150);
            commitRename();
          }}
          onKeyDown={(e) => {
            if (renaming && e.key === "Enter") commitRename();
          }}
        />
        {/* Hover actions: rename / move up / move down / remove */}
        <div className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
          {onRename && value && (
            <button
              type="button"
              title={actionLabels?.rename}
              onClick={() => {
                setRenaming(true);
                setOpen(false);
                inputRef.current?.focus();
                inputRef.current?.select();
              }}
              className={`px-0.5 text-xs ${renaming ? "text-emerald-700" : "text-neutral-400 hover:text-emerald-700"}`}
            >
              ✎
            </button>
          )}
          {onMoveUp && (
            <button
              type="button"
              title={actionLabels?.up}
              onClick={onMoveUp}
              className="px-0.5 text-xs text-neutral-400 hover:text-emerald-700"
            >
              ▲
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              title={actionLabels?.down}
              onClick={onMoveDown}
              className="px-0.5 text-xs text-neutral-400 hover:text-emerald-700"
            >
              ▼
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              title={actionLabels?.remove}
              onClick={onRemove}
              className="px-0.5 text-neutral-400 hover:text-red-600"
              aria-label={actionLabels?.remove ?? "remove"}
            >
              ×
            </button>
          )}
        </div>
      </div>
      {open && !renaming && status !== "idle" && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          {status === "loading" && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-500">
              <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-neutral-300 border-t-emerald-600" />
              {ts("searching")}
            </div>
          )}
          {status === "results" && (
            <ul>
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                    onMouseDown={() => {
                      onSelect({ name: s.name, lon: s.lon, lat: s.lat });
                      setStatus("idle");
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
          {status === "empty" && (
            <div className="px-3 py-2 text-sm text-neutral-500">{ts("noResults")}</div>
          )}
          {status === "rateLimited" && (
            <div className="px-3 py-2 text-sm text-amber-700">{ts("rateLimited")}</div>
          )}
          {status === "error" && (
            <div className="px-3 py-2 text-sm text-neutral-600">
              <span className="font-medium text-amber-700">{ts("unavailable")}</span>
              <span className="mt-0.5 block text-xs text-neutral-500">{ts("errorHint")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
