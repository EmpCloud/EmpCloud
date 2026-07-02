// =============================================================================
// EMP CLOUD — Custom Roles assignment field
// Searchable chips picker for assigning org-defined custom roles on top of
// a user's primary system role. Used by both the full Employee Profile page
// and the Edit Employee quick-edit modal.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import api from "@/api/client";
import { usePermissions } from "@/lib/use-permissions";

function extractApiError(err: any, t: (key: string) => string): string {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    t("customRolesField.error.requestFailed")
  );
}

export default function CustomRolesField({
  userId,
  canEdit,
  compact = false,
}: {
  userId: number;
  canEdit: boolean;
  /** When true, drops the help-text + nav link (modal context). */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Reading/assigning custom roles requires roles:view / roles:manage. Without
  // it both /roles/users/:id and /roles 403, and the field has no purpose, so
  // we skip the fetches and render nothing (e.g. a self-service employee in
  // their own edit form).
  const { has } = usePermissions();
  const canReadRoles = has("roles:view", "roles:manage");

  const { data: assigned = [], isLoading } = useQuery<any[]>({
    queryKey: ["user-custom-roles", userId],
    queryFn: () =>
      api.get(`/roles/users/${userId}`).then((r) => r.data?.data ?? []),
    enabled: canReadRoles,
  });

  const { data: allRoles = [] } = useQuery<any[]>({
    queryKey: ["roles-list"],
    queryFn: () => api.get("/roles").then((r) => r.data?.data ?? []),
    enabled: canEdit && canReadRoles,
  });

  const assign = useMutation({
    mutationFn: (roleId: number) =>
      api.post(`/roles/users/${userId}`, { role_id: roleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-custom-roles", userId] });
    },
  });
  const unassign = useMutation({
    mutationFn: (roleId: number) =>
      api.delete(`/roles/users/${userId}/${roleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-custom-roles", userId] });
    },
  });

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!canReadRoles) return null;

  const assignedIds = new Set<number>(assigned.map((r: any) => r.id));
  const candidates = (allRoles as any[]).filter(
    (r) => r.type === 1 && !assignedIds.has(r.id) && r.is_active,
  );

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 30);
    return candidates
      .filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.description || "").toLowerCase().includes(q),
      )
      .slice(0, 30);
  })();

  if (!canEdit) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t("customRolesField.label")}</label>
        <div className="min-h-[40px] flex flex-wrap items-center gap-1.5 border border-gray-200 rounded-md bg-gray-50 px-2 py-2">
          {isLoading ? (
            <span className="text-sm text-gray-400">{t("customRolesField.loading")}</span>
          ) : assigned.length === 0 ? (
            <span className="text-sm text-gray-400">{t("customRolesField.emptyReadonly")}</span>
          ) : (
            assigned.map((r) => (
              <span
                key={r.id}
                title={r.description || undefined}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-gray-200 text-xs text-gray-700"
              >
                {r.name}
              </span>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {t("customRolesField.label")}
        {assigned.length > 0 && (
          <span className="ml-2 text-xs font-normal text-gray-400">
            {t("customRolesField.assignedCount", { count: assigned.length })}
          </span>
        )}
      </label>
      {!compact && (
        <p className="text-xs text-gray-500 mb-2">
          {t("customRolesField.helpText")}{" "}
          <a href="/roles" className="text-brand-600 hover:underline">
            {t("customRolesField.helpTextLink")}
          </a>
          .
        </p>
      )}

      <div
        className="relative min-h-[42px] border border-gray-300 rounded-md bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500"
        onClick={() => setOpen(true)}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {assigned.map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-xs text-brand-700"
              title={r.description || undefined}
            >
              <span className="truncate max-w-[200px]">{r.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); unassign.mutate(r.id); }}
                disabled={unassign.isPending}
                className="ml-0.5 h-4 w-4 flex items-center justify-center rounded-full hover:bg-brand-200 disabled:opacity-50"
                aria-label={t("customRolesField.removeAria", { name: r.name })}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={
              assigned.length === 0
                ? t("customRolesField.placeholderEmpty")
                : t("customRolesField.placeholderMore")
            }
            className="flex-1 min-w-[140px] outline-none text-sm py-0.5 bg-transparent"
          />
        </div>

        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">
                {candidates.length === 0
                  ? t("customRolesField.noneToAssign")
                  : t("customRolesField.noMatches")}
              </div>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { assign.mutate(r.id); setQuery(""); }}
                  disabled={assign.isPending}
                  className="w-full flex items-start gap-2 px-3 py-2 text-sm hover:bg-brand-50 text-left disabled:opacity-50"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-gray-900 truncate font-medium">{r.name}</span>
                    {r.description && (
                      <span className="block text-xs text-gray-400 truncate">{r.description}</span>
                    )}
                    <span className="block text-[10px] text-gray-400 mt-0.5">
                      {t("customRolesField.permissionCount", { count: (r.permissions || []).length })}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {(assign.isError || unassign.isError) && (
        <p className="text-xs text-red-600 mt-1">
          {extractApiError(assign.error || unassign.error, t)}
        </p>
      )}
    </div>
  );
}
