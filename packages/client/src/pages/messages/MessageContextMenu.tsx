// =============================================================================
// EMP CLOUD — Message right-click context menu
// =============================================================================
//
// A single floating menu (opened by right-click / long-press on a message
// bubble) with all the message actions, plus a quick-reaction row on top. It
// positions itself at the cursor and stays inside the viewport.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Reply, Forward, Pencil, Trash2, Copy, Check, CheckSquare, Eye, Link as LinkIcon, Pin } from "lucide-react";
import { QUICK_REACTIONS } from "./MessageReactions";

export interface MessageMenuActions {
  onReact: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onSelect: () => void; // enter multi-select mode with this message selected
  onInfo?: () => void; // "seen by" — own group messages only
  onEdit?: () => void; // own text messages only
  onDelete?: () => void; // own messages only
  onCopy?: () => void; // messages with a body
  onCopyLink?: () => void; // copy a deep-link to this message
  onTogglePin?: () => void; // pin / unpin this message
  isPinned?: boolean;
}

export function MessageContextMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: MessageMenuActions;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [copied, setCopied] = useState(false);

  // Clamp to viewport after measuring.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
    if (top + r.height > window.innerHeight - 8) top = window.innerHeight - r.height - 8;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  // Close on outside click / Escape / scroll.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const run = (fn?: () => void) => {
    if (fn) fn();
    onClose();
  };

  const Item = ({
    icon,
    label,
    onClick,
    danger,
  }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm ${
        danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 min-w-[180px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
    >
      {/* Quick reactions */}
      <div className="flex items-center gap-0.5 px-2 pb-1.5 pt-1 border-b border-gray-100">
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => run(() => actions.onReact(e))}
            className="flex h-7 w-7 items-center justify-center rounded-full text-base hover:bg-gray-100"
          >
            {e}
          </button>
        ))}
      </div>

      <Item
        icon={<Reply className="h-4 w-4" />}
        label={t("messageContextMenu.actions.reply")}
        onClick={() => run(actions.onReply)}
      />
      <Item
        icon={<Forward className="h-4 w-4" />}
        label={t("messageContextMenu.actions.forward")}
        onClick={() => run(actions.onForward)}
      />
      <Item
        icon={<CheckSquare className="h-4 w-4" />}
        label={t("messageContextMenu.actions.selectMessages")}
        onClick={() => run(actions.onSelect)}
      />
      {actions.onInfo && (
        <Item
          icon={<Eye className="h-4 w-4" />}
          label={t("messageContextMenu.actions.messageInfo")}
          onClick={() => run(actions.onInfo)}
        />
      )}
      {actions.onCopy && (
        <Item
          icon={copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          label={copied ? t("messageContextMenu.actions.copied") : t("messageContextMenu.actions.copyText")}
          onClick={() => {
            actions.onCopy?.();
            setCopied(true);
            setTimeout(onClose, 600);
          }}
        />
      )}
      {actions.onCopyLink && (
        <Item
          icon={<LinkIcon className="h-4 w-4" />}
          label={t("messageContextMenu.actions.copyLink")}
          onClick={() => run(actions.onCopyLink)}
        />
      )}
      {actions.onTogglePin && (
        <Item
          icon={<Pin className="h-4 w-4" />}
          label={actions.isPinned ? t("messageContextMenu.actions.unpin") : t("messageContextMenu.actions.pin")}
          onClick={() => run(actions.onTogglePin)}
        />
      )}
      {actions.onEdit && (
        <Item
          icon={<Pencil className="h-4 w-4" />}
          label={t("messageContextMenu.actions.edit")}
          onClick={() => run(actions.onEdit)}
        />
      )}
      {actions.onDelete && (
        <Item
          icon={<Trash2 className="h-4 w-4" />}
          label={t("messageContextMenu.actions.delete")}
          danger
          onClick={() => run(actions.onDelete)}
        />
      )}
    </div>
  );
}
