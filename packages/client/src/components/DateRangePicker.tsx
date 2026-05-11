import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";

type Props = {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  onClear?: () => void;
  allowEmpty?: boolean;
  className?: string;
  label?: string;
  compact?: boolean;
};

const fmt = (iso: string): string => {
  if (!iso) return "";
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

const parseIso = (iso: string): Date | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? undefined : d;
};

export function DateRangePicker({
  from,
  to,
  onApply,
  onClear,
  allowEmpty,
  className,
  label,
  compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(() => ({
    from: parseIso(from),
    to: parseIso(to),
  }));
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setDraft({ from: parseIso(from), to: parseIso(to) });
    }
  }, [open, from, to]);

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
    setDraft({ from: start, to: end });
  };

  const handleApply = () => {
    const f = draft?.from ? isoOf(draft.from) : "";
    const t = draft?.to ? isoOf(draft.to) : "";
    if (!allowEmpty && !f) return;
    onApply(f, t);
    setOpen(false);
  };

  const handleClear = () => {
    setDraft(undefined);
    if (onClear) onClear();
    onApply("", "");
    setOpen(false);
  };

  const triggerLabel =
    from && to ? `${fmt(from)} → ${fmt(to)}` : from ? `From ${fmt(from)}` : "Select date range";

  const defaultMonth = useMemo(() => draft?.from ?? new Date(), [draft?.from]);

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
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pick a date range"
          className="absolute right-0 z-30 mt-2 w-[340px] rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
        >
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

          <div className="rdp-wrap text-sm">
            <DayPicker
              mode="range"
              numberOfMonths={1}
              defaultMonth={defaultMonth}
              selected={draft}
              onSelect={setDraft}
              showOutsideDays
              weekStartsOn={1}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-500">
            <div>
              <span className="font-medium uppercase">From</span>{" "}
              <span className="text-gray-800">{draft?.from ? fmt(isoOf(draft.from)) : "—"}</span>
            </div>
            <div>
              <span className="font-medium uppercase">To</span>{" "}
              <span className="text-gray-800">{draft?.to ? fmt(isoOf(draft.to)) : "—"}</span>
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
                disabled={!allowEmpty && !draft?.from}
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
