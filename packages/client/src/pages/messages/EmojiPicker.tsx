// =============================================================================
// EMP CLOUD — Lightweight emoji picker (no dependency)
// =============================================================================
//
// A compact, categorized emoji grid for the chat composer. Deliberately
// dependency-free — a curated set covers the vast majority of chat use without
// shipping a multi-hundred-KB emoji library.

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const CATEGORIES: { labelKey: string; emojis: string[] }[] = [
  {
    labelKey: "category.smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
      "😋", "😛", "😜", "🤪", "😝", "🤗", "🤔", "🤐", "😐", "😑",
      "😶", "😏", "😒", "🙄", "😬", "😌", "😔", "😪", "😴", "😷",
    ],
  },
  {
    labelKey: "category.gestures",
    emojis: [
      "👍", "👎", "👌", "🤌", "✌️", "🤞", "🤟", "🤙", "👈", "👉",
      "👆", "👇", "☝️", "👋", "🤚", "🖐️", "✋", "🙌", "👏", "🙏",
      "💪", "🤝", "👊", "✊", "🫶", "❤️", "🔥", "✨", "🎉", "💯",
    ],
  },
  {
    labelKey: "category.objects",
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
  const { t } = useTranslation();
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
      className="absolute bottom-full right-0 z-30 mb-2 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-xl"
    >
      {CATEGORIES.map((cat) => (
        <div key={cat.labelKey} className="mb-1">
          <p className="px-1.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t(`emojiPicker.${cat.labelKey}`)}
          </p>
          <div className="grid grid-cols-8 gap-0.5">
            {cat.emojis.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={t("emojiPicker.button.reactWithAriaLabel", { emoji: e })}
                // onMouseDown (with preventDefault) keeps the textarea focused for
                // mouse use; onKeyDown handles keyboard activation (Enter/Space)
                // since the preventDefault would otherwise swallow the click.
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  onPick(e);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    onPick(e);
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-muted focus-visible:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:focus-visible:bg-brand-950/40"
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
