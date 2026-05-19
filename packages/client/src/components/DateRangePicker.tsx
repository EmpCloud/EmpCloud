import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";

// Conservative panel-height estimate used on the FIRST paint before
// the real DOM node has been measured. The placement logic re-runs in
// a rAF after mount and replaces this with the actual offsetHeight, so
// being a bit pessimistic here is fine -- it just means we may flip up
// preemptively on the very first frame.
const PICKER_HEIGHT_FALLBACK = 520;
const PICKER_WIDTH = 340;
const VIEWPORT_MARGIN = 8;

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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Fixed coords for the portalled panel. Computed when the picker opens
  // (and on resize / scroll) so it sits flush against the trigger even
  // when the trigger lives inside a modal that clips its overflow.
  // maxHeight is the safety belt: if neither above nor below has room
  // for the full picker, we clamp the panel to the larger available
  // span and let its inner content scroll so Apply is always reachable.
  const [panelPos, setPanelPos] = useState<
    { top: number; left: number; maxHeight: number } | null
  >(null);

  useEffect(() => {
    if (open) {
      setDraft({ from: parseIso(from), to: parseIso(to) });
    }
  }, [open, from, to]);

  // Recompute the portal panel's position. Called on open, on window
  // resize, and on scroll bubbling from any ancestor (capture phase to
  // catch scroll on modal bodies + the document). The trigger's
  // viewport rect drives placement: prefer below; flip above if the
  // picker would otherwise overflow the bottom edge; clamp + scroll if
  // neither side has enough room.
  const recomputePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    // Real measured height once the panel has mounted; conservative
    // fallback for the first frame. Using the real value is what makes
    // the flip-up decision correct -- the old hard-coded estimate was
    // smaller than the rendered panel, so it kept choosing "below" and
    // the Apply button ended up off-screen.
    const measured = panelRef.current?.offsetHeight ?? 0;
    const panelH = measured > 0 ? measured : PICKER_HEIGHT_FALLBACK;

    const spaceBelow = vh - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;

    let top: number;
    let maxHeight: number;
    if (panelH <= spaceBelow) {
      top = rect.bottom + 8;
      maxHeight = spaceBelow;
    } else if (panelH <= spaceAbove) {
      top = rect.top - 8 - panelH;
      maxHeight = spaceAbove;
    } else if (spaceBelow >= spaceAbove) {
      // No side has room for the full panel -- pin to whichever side
      // has more space and let the inner content scroll. Apply stays
      // reachable because the panel's bottom is the scrollable region's
      // bottom, not the page's.
      top = rect.bottom + 8;
      maxHeight = Math.max(200, spaceBelow);
    } else {
      maxHeight = Math.max(200, spaceAbove);
      top = Math.max(VIEWPORT_MARGIN, rect.top - 8 - maxHeight);
    }

    // Horizontal placement: right-align with the trigger by default;
    // clamp to viewport so it never leaks off the screen edges.
    let left = rect.right - PICKER_WIDTH;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (left + PICKER_WIDTH > vw - VIEWPORT_MARGIN) {
      left = vw - PICKER_WIDTH - VIEWPORT_MARGIN;
    }

    setPanelPos({ top, left, maxHeight });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    // Initial position with the fallback height estimate so the panel
    // has somewhere to render. Then a rAF re-run picks up the real
    // measured height and flips up if needed -- this two-pass dance is
    // what guarantees Apply stays visible even in a tight modal.
    recomputePosition();
    const raf = requestAnimationFrame(recomputePosition);
    const onScroll = () => recomputePosition();
    const onResize = () => recomputePosition();
    // Capture-phase scroll so we catch scroll events on modal bodies,
    // panes, anything between the trigger and the document root.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // Click must be outside BOTH the trigger wrapper AND the portalled
      // panel -- the panel is no longer inside `wrapRef`, so the old
      // contains() check alone would dismiss the picker the instant the
      // user clicked a calendar day.
      const inTrigger = wrapRef.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (!inTrigger && !inPanel) {
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
        ref={triggerRef}
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

      {open && panelPos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Pick a date range"
            // Portalled to document.body so it escapes the overflow /
            // stacking context of any modal it's rendered inside. Fixed
            // positioning + z-[60] keeps it above modal backdrops (which
            // typically sit at z-50). Width hard-locked to PICKER_WIDTH
            // so the position calc stays accurate. maxHeight + overflow
            // make sure the panel never spills past the viewport edge --
            // the inner area scrolls and Apply remains clickable.
            style={{
              position: "fixed",
              top: panelPos.top,
              left: panelPos.left,
              width: PICKER_WIDTH,
              maxHeight: panelPos.maxHeight,
              overflowY: "auto",
            }}
            className="z-[60] rounded-xl border border-gray-200 bg-white p-4 shadow-2xl"
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
          </div>,
          document.body,
        )}
    </div>
  );
}

export default DateRangePicker;
