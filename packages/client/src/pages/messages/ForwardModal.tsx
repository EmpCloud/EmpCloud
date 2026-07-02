// =============================================================================
// EMP CLOUD — Forward a message to other conversations OR any employee
// =============================================================================
//
// Targets are: existing chats (groups + direct conversations) AND every other
// employee in the directory. Forwarding to an employee you've never chatted with
// transparently starts/gets the direct conversation first, then forwards into it.

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { ChatMessage, ConversationSummary } from "@empcloud/shared";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { showToast } from "@/components/ui/Toast";
import { X, Search, Check, Forward, Users } from "lucide-react";
import { splitName } from "./chat-utils";

interface DirectoryEmployee {
  id: number;
  first_name: string;
  last_name: string;
  designation?: string | null;
  photo_path?: string | null;
}
function extractEmployees(payload: unknown): DirectoryEmployee[] {
  const data = (payload as { data?: unknown })?.data;
  if (Array.isArray(data)) return data as DirectoryEmployee[];
  const nested = (data as { data?: unknown })?.data;
  if (Array.isArray(nested)) return nested as DirectoryEmployee[];
  return [];
}

// A unified selectable target: either an existing conversation or an employee
// (a direct chat we may need to create on forward).
type Target =
  | { kind: "conversation"; key: string; id: number; title: string; isGroup: boolean; counterpartId?: number; photo?: string | null }
  | { kind: "employee"; key: string; userId: number; title: string; sub?: string | null; photo?: string | null };

export function ForwardModal({
  messages,
  sourceConversationId,
  onClose,
  onForwarded,
}: {
  /** One or more messages to forward (in selection / chronological order). */
  messages: ChatMessage[];
  sourceConversationId: number;
  onClose: () => void;
  onForwarded: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const meId = useAuthStore((s) => s.user?.id);

  const { data: conversations } = useQuery<ConversationSummary[]>({
    queryKey: ["chat-conversations"],
    queryFn: () => api.get("/chat/conversations").then((r) => r.data.data),
    staleTime: 10_000,
  });

  const { data: employees, isLoading: empLoading } = useQuery<DirectoryEmployee[]>({
    queryKey: ["chat-directory", search],
    queryFn: () =>
      api
        .get("/employees/directory", { params: { per_page: 200, ...(search ? { search } : {}) } })
        .then((r) => extractEmployees(r.data)),
    staleTime: 30_000,
  });

  const q = search.trim().toLowerCase();

  // Existing chats (minus the source) as targets.
  const chatTargets: Target[] = useMemo(
    () =>
      (conversations ?? [])
        .filter((c) => c.id !== sourceConversationId)
        .filter((c) => !q || c.title.toLowerCase().includes(q))
        .map((c) => ({
          kind: "conversation" as const,
          key: `c:${c.id}`,
          id: c.id,
          title: c.title,
          isGroup: c.type === "group",
          counterpartId: c.counterpart?.user_id,
          photo: c.counterpart?.photo_path,
        })),
    [conversations, sourceConversationId, q],
  );

  // Employees who DON'T already have a direct chat in the list above, so we
  // don't show the same person twice.
  const directCounterpartIds = useMemo(
    () =>
      new Set(
        (conversations ?? [])
          .filter((c) => c.type === "direct" && c.counterpart)
          .map((c) => c.counterpart!.user_id),
      ),
    [conversations],
  );

  const employeeTargets: Target[] = useMemo(
    () =>
      (employees ?? [])
        // Exclude the current user (can't forward to yourself — there's no
        // self-chat) and anyone you already have a direct chat with.
        .filter((e) => e.id !== meId && !directCounterpartIds.has(e.id))
        .map((e) => ({
          kind: "employee" as const,
          key: `e:${e.id}`,
          userId: e.id,
          title: `${e.first_name} ${e.last_name}`,
          sub: e.designation,
          photo: e.photo_path,
        })),
    [employees, directCounterpartIds, meId],
  );

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleForward = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      // Resolve every selection to a target conversation id. Employees need a
      // direct conversation started/fetched first.
      const allTargets = [...chatTargets, ...employeeTargets];
      const convIds: number[] = [];
      for (const key of selected) {
        const tgt = allTargets.find((x) => x.key === key);
        if (!tgt) continue;
        if (tgt.kind === "conversation") {
          convIds.push(tgt.id);
        } else {
          // Defensive: never start a direct chat with yourself.
          if (tgt.userId === meId) continue;
          const res = await api.post("/chat/conversations/direct", { user_id: tgt.userId });
          convIds.push(res.data.data.id);
        }
      }
      if (convIds.length === 0) throw new Error("no targets");

      // Forward in chronological (id) order.
      const messageIds = [...messages].sort((a, b) => a.id - b.id).map((m) => m.id);
      await api.post(`/chat/conversations/${sourceConversationId}/forward`, {
        message_ids: messageIds,
        target_conversation_ids: convIds,
      });
      const n = messageIds.length;
      showToast(
        "success",
        t("forwardModal.toast.forwardSuccess", { count: n, chatCount: convIds.length }),
      );
      onForwarded();
    } catch {
      showToast("error", t("forwardModal.toast.forwardError"));
    } finally {
      setSending(false);
    }
  };

  // Preview line: single message text/attachment, or "N messages".
  const preview =
    messages.length === 1
      ? messages[0].body ||
        (messages[0].attachment
          ? t("forwardModal.preview.attachment", { name: messages[0].attachment.name })
          : t("forwardModal.preview.messageFallback"))
      : t("forwardModal.preview.multiple", { count: messages.length });

  const Row = ({ target }: { target: Target }) => {
    const isSel = selected.has(target.key);
    const isGroup = target.kind === "conversation" && target.isGroup;
    const { first, last } = splitName(target.title);
    const avatarUserId = target.kind === "conversation" ? target.counterpartId : target.userId;
    return (
      <button
        onClick={() => toggle(target.key)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
          isSel ? "bg-brand-50" : "hover:bg-gray-50"
        }`}
      >
        {isGroup ? (
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <Users className="h-5 w-5" />
          </span>
        ) : (
          <EmployeeAvatar
            userId={avatarUserId}
            hasPhoto={!!target.photo}
            firstName={first}
            lastName={last}
            size="md"
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-800">{target.title}</span>
          {target.kind === "employee" && target.sub && (
            <span className="block truncate text-xs text-gray-400">{target.sub}</span>
          )}
        </span>
        <span
          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
            isSel ? "bg-brand-600 border-brand-600 text-white" : "border-gray-300"
          }`}
        >
          {isSel && <Check className="h-3 w-3" />}
        </span>
      </button>
    );
  };

  const nothing = chatTargets.length === 0 && employeeTargets.length === 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[80vh] bg-white rounded-2xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{t("forwardModal.heading.title")}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The message being forwarded */}
        <div className="px-5 pt-3">
          <div className="rounded-lg border-l-2 border-brand-400 bg-brand-50/60 px-3 py-2">
            <p className="text-xs text-gray-400">{t("forwardModal.section.forwarding")}</p>
            <p className="truncate text-sm text-gray-700">{preview}</p>
          </div>
        </div>

        <div className="px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("forwardModal.search.placeholder")}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 border-t border-gray-100">
          {nothing && empLoading ? (
            <p className="px-3 py-6 text-center text-sm text-gray-400">{t("forwardModal.state.loading")}</p>
          ) : nothing ? (
            <p className="px-3 py-6 text-center text-sm text-gray-400">
              {q
                ? t("forwardModal.state.noMatches", { query: search })
                : t("forwardModal.state.noTargets")}
            </p>
          ) : (
            <>
              {chatTargets.length > 0 && (
                <>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {t("forwardModal.section.chats")}
                  </p>
                  {chatTargets.map((target) => (
                    <Row key={target.key} target={target} />
                  ))}
                </>
              )}
              {employeeTargets.length > 0 && (
                <>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {t("forwardModal.section.people")}
                  </p>
                  {employeeTargets.map((target) => (
                    <Row key={target.key} target={target} />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            {t("forwardModal.footer.selectedCount", { count: selected.size })}
          </span>
          <button
            onClick={handleForward}
            disabled={selected.size === 0 || sending}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
          >
            <Forward className="h-4 w-4" />
            {sending ? t("forwardModal.button.forwarding") : t("forwardModal.button.forward")}
          </button>
        </div>
      </div>
    </div>
  );
}
