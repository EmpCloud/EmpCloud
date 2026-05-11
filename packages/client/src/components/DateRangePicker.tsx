import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, X } from "lucide-react";

// =============================================================================
// DateRangePicker — single-control replacement for the legacy "from + to"
// pair on the attendance pages. Visually presents as one chip/button; opening
// it reveals two side-by-side date inputs plus quick presets ("Last 7 days",
// "Last 30 days", "This month", "Last month"). The component is fully
// controlled; the parent owns `from` / `to` state and the component just
// exposes onApply / onClear so the parent can keep its existing API contract
// (the server still receives `date_from` and `date_to` strings).
// =============================================================================

type Props = {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  onClear?: () => void;
  // When true, an empty from/to is allowed (the parent decides whether the
  // empty state means "ignore range" or "show all"). Defaults to false so
  // Apply requires at least a `from` date.
  allowEmpty?: boolean;
  className?: string;
  // Optional label shown above the trigger button.
  label?: string;
  // Render compact (no label) when used inline.
  compact?: boolean;
};

const fmt = (iso: string): string => {
  if (!iso) return "";
  // Display in the user's locale but keep the ISO value for the form post.
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const isoOf = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function DateRangePicker({ from, to, onApply, onClear, allowEmpty, className, label, compact }: Props) {
  const [open, setOpen] = useState(false);
  // Local edit buffer so users can change one input without firing a query
  // until they click Apply. Sync from props each time the popover opens.
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setDraftFrom(from);
      setDraftTo(to);
    }
  }, [open, from, to]);

  // Close on outside click / Escape so the popover behaves like a menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const applyPreset = (kind: "today" | "last7" | "last30" | "thisMonth" | "lastMonth") => {
    const now = new Date();
    let start: Date;
    let end: Date = now;
    switch (kind) {
      case "today":
        start = now;
        break;
      case "last7":
        start = new Date(now);
        start.setDate(now.getDate() - 6);
        break;
      case "last30":
        start = new Date(now);
        start.setDate(now.getDate() - 29);
        break;
      case "thisMonth":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = now;
        break;
      case "lastMonth":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
    }
    setDraftFrom(isoOf(start));
    setDraftTo(isoOf(end));
  };

  const handleApply = () => {
    if (!allowEmpty && !draftFrom) return;
    // Normalise: if `to` is before `from`, swap (helps when users key the
    // wrong order — same behaviour as native HTML date inputs would expect).
    let f = draftFrom;
    let t = draftTo;
    if (f && t && new Date(t) < new Date(f)) {
      [f, t] = [t, f];
    }
    onApply(f, t);
    setOpen(false);
  };

  const handleClear = () => {
    setDraftFrom("");
    setDraftTo("");
    if (onClear) onClear();
    onApply("", "");
    setOpen(false);
  };

  const triggerLabel =
    from && to
      ? `${fmt(from)} → ${fmt(to)}`
      : from
      ? `From ${fmt(from)}`
      : "Select date range";

  return (
    <div ref={wrapRef} className={`relative inline-block ${className || ""}`}>
      {label && !compact && (
        <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays className="h-4 w-4 text-gray-500" />
        <span className={from ? "text-gray-900" : "text-gray-400"}>{triggerLabel}</span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pick a date range"
          className="absolute right-0 z-30 mt-2 w-[320px] rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
        >
          {/* Presets */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              { key: "today", label: "Today" },
              { key: "last7", label: "Last 7 days" },
              { key: "last30", label: "Last 30 days" },
              { key: "thisMonth", label: "This month" },
              { key: "lastMonth", label: "Last month" },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key as any)}
                className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase text-gray-500">From</label>
              <input
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase text-gray-500">To</label>
              <input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(e) => setDraftTo(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!allowEmpty && !draftFrom}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;
