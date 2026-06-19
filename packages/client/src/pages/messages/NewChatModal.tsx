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

import { useEffect, useMemo, useState } from "react";
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
        selected ? "bg-brand-50" : "hover:bg-gray-50"
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
        <p className="text-sm font-medium text-gray-900 truncate">
          {emp.first_name} {emp.last_name}
        </p>
        {emp.designation && (
          <p className="text-xs text-gray-400 truncate">{emp.designation}</p>
        )}
      </div>
      {showCheckbox ? (
        <span
          className={`flex items-center justify-center h-5 w-5 rounded border flex-shrink-0 ${
            selected ? "bg-brand-600 border-brand-600 text-white" : "border-gray-300"
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
  const me = useAuthStore((s) => s.user);
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Debounce the search input (300ms) before it hits the API.
  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [rawSearch]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      showToast("error", "Couldn't start that conversation.");
      setSubmitting(false);
    }
  };

  const createGroup = async () => {
    const name = groupName.trim();
    if (!name) {
      showToast("error", "Please give the group a name.");
      return;
    }
    if (selectedIds.length < 2) {
      showToast("error", "Select at least 2 people for a group.");
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
      showToast("error", "Couldn't create the group.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-bold text-gray-900">New chat</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="px-5">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(["direct", "group"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {m === "group" ? "Group" : "Direct"}
              </button>
            ))}
          </div>
        </div>

        {/* Group name (group mode only) */}
        {mode === "group" && (
          <div className="px-5 pt-4">
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              maxLength={120}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none transition-colors focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
            />
          </div>
        )}

        {/* Search */}
        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Search employees…"
              autoFocus
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm outline-none transition-colors focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
            />
          </div>
        </div>

        {/* Employee list */}
        <div className="flex-1 overflow-y-auto px-3 pb-1 min-h-[12rem]">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : isError ? (
            <div className="py-10 text-center text-sm text-red-500">
              Failed to load employees.
            </div>
          ) : list.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              {search ? "No employees match your search." : "No employees found."}
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
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500">
              {selectedIds.length} selected{selectedIds.length < 2 ? " · need ≥ 2" : ""}
            </span>
            <button
              onClick={createGroup}
              disabled={submitting || !groupName.trim() || selectedIds.length < 2}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              Create group
            </button>
          </div>
        )}

        {mode === "direct" && submitting && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Starting conversation…
          </div>
        )}
      </div>
    </div>
  );
}
