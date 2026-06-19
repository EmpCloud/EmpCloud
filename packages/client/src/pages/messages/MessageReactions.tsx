// =============================================================================
// EMP CLOUD — Message reaction pills + quick reaction picker
// =============================================================================

import type { MessageReaction } from "@empcloud/shared";

// The quick-react row shown on hover (a small curated set; the composer's full
// emoji picker isn't reused here to keep reactions one tap).
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏"];

/** The aggregated reaction pills shown under a message bubble. */
export function ReactionPills({
  reactions,
  mine,
  onToggle,
}: {
  reactions: MessageReaction[];
  mine: boolean;
  onToggle: (emoji: string) => void;
}) {
  if (!reactions || reactions.length === 0) return null;
  return (
    <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          title={r.names.join(", ")}
          className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
            r.reacted
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="leading-none">{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

/** The hover quick-picker (a tiny popover of emojis to add a reaction). */
export function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1 py-0.5 shadow-sm">
      {QUICK_REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          onMouseDown={(ev) => {
            ev.preventDefault();
            onPick(e);
          }}
          className="flex h-6 w-6 items-center justify-center rounded-full text-sm hover:bg-gray-100"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
