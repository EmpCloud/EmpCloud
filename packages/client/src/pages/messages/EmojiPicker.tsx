// =============================================================================
// EMP CLOUD — Lightweight emoji picker (no dependency)
// =============================================================================
//
// A compact, categorized emoji grid for the chat composer. Deliberately
// dependency-free — a curated set covers the vast majority of chat use without
// shipping a multi-hundred-KB emoji library.

import { useEffect, useRef } from "react";

const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
      "😋", "😛", "😜", "🤪", "😝", "🤗", "🤔", "🤐", "😐", "😑",
      "😶", "😏", "😒", "🙄", "😬", "😌", "😔", "😪", "😴", "😷",
    ],
  },
  {
    label: "Gestures",
    emojis: [
      "👍", "👎", "👌", "🤌", "✌️", "🤞", "🤟", "🤙", "👈", "👉",
      "👆", "👇", "☝️", "👋", "🤚", "🖐️", "✋", "🙌", "👏", "🙏",
      "💪", "🤝", "👊", "✊", "🫶", "❤️", "🔥", "✨", "🎉", "💯",
    ],
  },
  {
    label: "Objects",
    emojis: [
      "✅", "❌", "⚠️", "❓", "❗", "💡", "📌", "📎", "📁", "📅",
      "⏰", "📞", "💬", "📝", "📊", "💼", "🚀", "⭐", "🏆", "☕",
    ],
  },
];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 mb-2 w-72 max-h-72 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl z-30 p-2"
    >
      {CATEGORIES.map((cat) => (
        <div key={cat.label} className="mb-1">
          <p className="px-1.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {cat.label}
          </p>
          <div className="grid grid-cols-8 gap-0.5">
            {cat.emojis.map((e) => (
              <button
                key={e}
                type="button"
                onMouseDown={(ev) => {
                  ev.preventDefault(); // keep textarea focus
                  onPick(e);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-gray-100"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
