// =============================================================================
// EMP CLOUD — New Chat picker modal
// =============================================================================
//
// Two modes:
//   Direct — pick one employee → POST /chat/conversations/direct
//   Group  — name + pick ≥2 employees → POST /chat/conversations/group
//
// The employee list comes from the directory (GET /employees/directory),
// debounced on search. The current user is excluded.

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { ConversationSummary } from "@empcloud/shared";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { showToast } from "@/components/ui/Toast";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { Check, Loader2, Search, Users, X } from "lucide-react";

interface DirectoryEmployee {
  id: number;
  first_name: string;
  last_name: string;
  email?: string | null;
  designation?: string | null;
  photo_path?: string | null;
  has_biometric_face?: boolean;
}

/** The directory endpoint returns either `data: Employee[]` or
 *  `data: { data: Employee[] }` — normalise both shapes. */
function extractEmployees(payload: unknown): DirectoryEmployee[] {
  const data = (payload as { data?: unknown })?.data;
  if (Array.isArray(data)) return data as DirectoryEmployee[];
  const nested = (data as { data?: unknown })?.data;
  if (Array.isArray(nested)) return nested as DirectoryEmployee[];
  return [];
}

function useDirectory(search: string) {
  return useQuery<DirectoryEmployee[]>({
    queryKey: ["chat-directory", search],
    queryFn: () =>
      api
        .get("/employees/directory", {
          params: { per_page: 100, ...(search ? { search } : {}) },
        })
        .then((r) => extractEmployees(r.data)),
    staleTime: 30_000,
  });
}

function EmployeeListItem({
  emp,
  selected,
  onClick,
  showCheckbox,
}: {
  emp: DirectoryEmployee;
  selected: boolean;
  onClick: () => void;
  showCheckbox: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
        selected ? "bg-brand-50 dark:bg-brand-950/40" : "hover:bg-muted"
      }`}
    >
      <EmployeeAvatar
        userId={emp.id}
        hasPhoto={!!emp.photo_path}
        hasBiometricFace={emp.has_biometric_face}
        firstName={emp.first_name}
        lastName={emp.last_name}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground">
          {emp.first_name} {emp.last_name}
        </p>
        {emp.designation && (
          <p className="truncate text-xs text-muted-foreground">{emp.designation}</p>
        )}
      </div>
      {showCheckbox ? (
        <span
          className={`flex items-center justify-center h-5 w-5 rounded border flex-shrink-0 ${
            selected ? "border-brand-600 bg-brand-600 text-white" : "border-border"
          }`}
        >
          {selected && <Check className="h-3.5 w-3.5" />}
        </span>
      ) : null}
    </button>
  );
}

export default function NewChatModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conv: ConversationSummary) => void;
}) {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce the search input (300ms) before it hits the API.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(rawSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [rawSearch]);

  const { data: employees, isLoading, isError } = useDirectory(search);

  // Exclude the current user from the picker.
  const list = useMemo(
    () => (employees ?? []).filter((e) => e.id !== me?.id),
    [employees, me?.id]
  );

  const toggle = (id: number) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const startDirect = async (userId: number) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await api.post("/chat/conversations/direct", { user_id: userId });
      onCreated(res.data.data as ConversationSummary);
    } catch {
      showToast("error", t("newChatModal.toast.directError"));
      setSubmitting(false);
    }
  };

  const createGroup = async () => {
    const name = groupName.trim();
    if (!name) {
      showToast("error", t("newChatModal.validation.groupNameRequired"));
      return;
    }
    if (selectedIds.length < 2) {
      showToast("error", t("newChatModal.validation.minTwoMembers"));
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await api.post("/chat/conversations/group", {
        name,
        member_ids: selectedIds,
      });
      onCreated(res.data.data as ConversationSummary);
    } catch {
      showToast("error", t("newChatModal.toast.groupError"));
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/40" />
        <Dialog.Content
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-chat-dialog-title"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchInputRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-[9998] flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <Dialog.Title asChild>
            <h2 id="new-chat-dialog-title" className="text-base font-semibold tracking-tight text-foreground">{t("newChatModal.header.title")}</h2>
          </Dialog.Title>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label={t("newChatModal.actions.close")}
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="px-5">
          <div className="flex gap-1 rounded-md bg-muted p-1">
            {(["direct", "group"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "group" ? t("newChatModal.mode.group") : t("newChatModal.mode.direct")}
              </button>
            ))}
          </div>
        </div>

        {/* Group name (group mode only) */}
        {mode === "group" && (
          <div className="px-5 pt-4">
            <input
              aria-label={t("newChatModal.group.namePlaceholder")}
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t("newChatModal.group.namePlaceholder")}
              maxLength={120}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground transition-colors duration-150 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </div>
        )}

        {/* Search */}
        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              aria-label={t("newChatModal.search.placeholder")}
              type="text"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder={t("newChatModal.search.placeholder")}
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-[13px] text-foreground transition-colors duration-150 focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </div>
        </div>

        {/* Employee list */}
        <div className="flex-1 overflow-y-auto px-3 pb-1 min-h-[12rem]">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : isError ? (
            <div className="py-10 text-center text-sm text-red-500">
              {t("newChatModal.list.loadError")}
            </div>
          ) : list.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-muted-foreground">
              {search ? t("newChatModal.list.emptySearch") : t("newChatModal.list.empty")}
            </div>
          ) : (
            <div className="space-y-0.5">
              {list.map((emp) => (
                <EmployeeListItem
                  key={emp.id}
                  emp={emp}
                  selected={mode === "group" && selectedIds.includes(emp.id)}
                  showCheckbox={mode === "group"}
                  onClick={() =>
                    mode === "direct" ? startDirect(emp.id) : toggle(emp.id)
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer (group mode → create button) */}
        {mode === "group" && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {!groupName.trim() ? (
                <span className="text-amber-600">{t("newChatModal.group.enterNameHint")}</span>
              ) : selectedIds.length < 2 ? (
                <span className="text-amber-600">
                  {t("newChatModal.group.selectedNeedMore", { count: selectedIds.length })}
                </span>
              ) : (
                t("newChatModal.group.selectedCount", { count: selectedIds.length })
              )}
            </span>
            <button
              type="button"
              onClick={createGroup}
              disabled={submitting || !groupName.trim() || selectedIds.length < 2}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              {t("newChatModal.actions.createGroup")}
            </button>
          </div>
        )}

        {mode === "direct" && submitting && (
          <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("newChatModal.direct.starting")}
          </div>
        )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
