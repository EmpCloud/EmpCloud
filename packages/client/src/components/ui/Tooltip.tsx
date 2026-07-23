// =============================================================================
// EMP CLOUD — Tooltip
//
// Small hover/focus hint used to keep dense admin screens readable: the long
// explanatory paragraph moves behind an (i) icon instead of crowding the form.
//
// Accessible by design — the trigger is a real <button> so it is keyboard
// reachable, the bubble is linked via aria-describedby, and Escape dismisses
// it. Pointer-events are disabled on the bubble so it never eats clicks.
// =============================================================================

import { useId, useState } from "react";
import { Info } from "lucide-react";

type Side = "top" | "bottom" | "left" | "right";

const SIDE_CLASSES: Record<Side, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

export default function Tooltip({
  content,
  side = "top",
  label = "More information",
  className = "",
}: {
  content: React.ReactNode;
  side?: Side;
  /** Accessible name for the trigger. */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        // Don't submit forms / toggle the checkbox this icon sits next to.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-full"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute z-50 w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg pointer-events-none dark:bg-gray-700 ${SIDE_CLASSES[side]}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
