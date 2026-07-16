import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";

// Conservative panel-size estimates used on the FIRST paint before the real
// DOM node has been measured. The placement logic re-runs in a rAF after
// mount and replaces these with the actual offset size, so being a bit
// pessimistic here is fine -- it just means we may flip up / shift on the
// very first frame. The dual-month + preset-sidebar layout is wide, so the
// estimate is generous; actual width is measured once mounted.
const PICKER_HEIGHT_FALLBACK = 420;
const PICKER_WIDTH = 720;
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
  // "June 05, 2026" — long month + zero-padded day, matching the reference UI.
  return d.toLocaleDateString(undefined, { month: "long", day: "2-digit", year: "numeric" });
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

// Preset definitions + range math, shared by the sidebar buttons and the
// "which preset does the current selection match?" detection that drives the
// active highlight.
type PresetKey = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth";

const PRESETS: { key: PresetKey; labelKey: string }[] = [
  { key: "today", labelKey: "dateRangePicker.preset.today" },
  { key: "yesterday", labelKey: "dateRangePicker.preset.yesterday" },
  { key: "last7", labelKey: "dateRangePicker.preset.last7" },
  { key: "last30", labelKey: "dateRangePicker.preset.last30" },
  { key: "thisMonth", labelKey: "dateRangePicker.preset.thisMonth" },
  { key: "lastMonth", labelKey: "dateRangePicker.preset.lastMonth" },
];

const presetRange = (kind: PresetKey): { from: Date; to: Date } => {
  const now = new Date();
  let start: Date;
  let end: Date = now;
  switch (kind) {
    case "today":
      start = now;
      break;
    case "yesterday":
      start = new Date(now);
      start.setDate(now.getDate() - 1);
      end = new Date(start);
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
  return { from: start, to: end };
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(() => ({
    from: parseIso(from),
    to: parseIso(to),
  }));
  // Which sidebar entry is highlighted. "custom" once the user touches the
  // calendars directly; null when nothing is selected yet.
  const [activePreset, setActivePreset] = useState<PresetKey | "custom" | null>(null);
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

  // Detect which preset (if any) an ISO from/to pair corresponds to, so the
  // sidebar can highlight it when the picker is reopened on an existing range.
  const detectPreset = (f: string, toIso: string): PresetKey | "custom" | null => {
    if (!f) return null;
    for (const p of PRESETS) {
      const r = presetRange(p.key);
      if (isoOf(r.from) === f && isoOf(r.to) === toIso) return p.key;
    }
    return "custom";
  };

  useEffect(() => {
    if (open) {
      setDraft({ from: parseIso(from), to: parseIso(to) });
      setActivePreset(detectPreset(from, to));
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

    // Real measured size once the panel has mounted; conservative fallbacks
    // for the first frame. Measuring width matters for the wide dual-month
    // layout so right-alignment + the viewport clamp stay accurate regardless
    // of the calendar's intrinsic size.
    const measuredH = panelRef.current?.offsetHeight ?? 0;
    const panelH = measuredH > 0 ? measuredH : PICKER_HEIGHT_FALLBACK;
    const measuredW = panelRef.current?.offsetWidth ?? 0;
    const panelW = measuredW > 0 ? measuredW : PICKER_WIDTH;

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
    let left = rect.right - panelW;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (left + panelW > vw - VIEWPORT_MARGIN) {
      left = vw - panelW - VIEWPORT_MARGIN;
    }
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    setPanelPos({ top, left, maxHeight });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    // Initial position with the fallback size estimate so the panel has
    // somewhere to render. Then a rAF re-run picks up the real measured
    // size and flips up / shifts if needed -- this two-pass dance is what
    // guarantees Apply stays visible even in a tight modal.
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

  const applyPreset = (kind: PresetKey) => {
    const { from: start, to: end } = presetRange(kind);
    setDraft({ from: start, to: end });
    setActivePreset(kind);
  };

  const handleApply = () => {
    const f = draft?.from ? isoOf(draft.from) : "";
    const toIso = draft?.to ? isoOf(draft.to) : "";
    if (!allowEmpty && !f) return;
    onApply(f, toIso);
    setOpen(false);
  };

  const handleClear = () => {
    setDraft(undefined);
    setActivePreset(null);
    if (onClear) onClear();
    onApply("", "");
    setOpen(false);
  };

  const triggerLabel =
    from && to
      ? `${fmt(from)} - ${fmt(to)}`
      : from
        ? fmt(from)
        : t("dateRangePicker.trigger.placeholder");

  const defaultMonth = useMemo(() => draft?.from ?? new Date(), [draft?.from]);

  const footerLabel = draft?.from
    ? `${fmt(isoOf(draft.from))}${draft?.to ? ` - ${fmt(isoOf(draft.to))}` : ""}`
    : t("dateRangePicker.footer.empty");

  return (
    <div ref={wrapRef} className={`relative inline-block ${className || ""}`}>
      {label && !compact && (
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className={from ? "text-foreground" : "text-muted-foreground"}>{triggerLabel}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && panelPos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t("dateRangePicker.dialog.ariaLabel")}
            // Portalled to document.body so it escapes the overflow /
            // stacking context of any modal it's rendered inside. Fixed
            // positioning + z-[60] keeps it above modal backdrops (which
            // typically sit at z-50). Width is intrinsic (sidebar + two
            // months), capped to the viewport; maxHeight + overflow make
            // sure the panel never spills past the viewport edge.
            style={{
              position: "fixed",
              top: panelPos.top,
              left: panelPos.left,
              maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
              maxHeight: panelPos.maxHeight,
              overflow: "auto",
            }}
            className="z-[60] rounded-xl border border-border bg-card p-4 shadow-2xl"
          >
            <div className="flex gap-3">
              {/* Preset sidebar */}
              <div className="flex w-32 shrink-0 flex-col gap-1 border-r border-border pr-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.key)}
                    className={`rounded-md px-3 py-1.5 text-left text-sm transition ${
                      activePreset === p.key
                        ? "bg-brand-600 text-white"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t(p.labelKey)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setActivePreset("custom")}
                  className={`rounded-md px-3 py-1.5 text-left text-sm transition ${
                    activePreset === "custom"
                      ? "bg-brand-600 text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t("dateRangePicker.preset.customRange")}
                </button>
              </div>

              {/* Two-month calendar */}
              <div className="rdp-wrap text-sm">
                <DayPicker
                  mode="range"
                  numberOfMonths={2}
                  defaultMonth={defaultMonth}
                  selected={draft}
                  onSelect={(r) => {
                    setDraft(r);
                    setActivePreset("custom");
                  }}
                  showOutsideDays
                  weekStartsOn={0}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{footerLabel}</span>
                {allowEmpty && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-muted-foreground"
                  >
                    <X className="h-3 w-3" /> {t("dateRangePicker.action.clear")}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  {t("dateRangePicker.action.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!allowEmpty && !draft?.from}
                  className="rounded-md bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {t("dateRangePicker.action.apply")}
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
