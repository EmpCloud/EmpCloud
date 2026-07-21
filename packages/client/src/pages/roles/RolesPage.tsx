// =============================================================================
// EMP CLOUD — Roles & Permissions
// Settings → Roles & Permissions. List + role-builder modal in one file so
// the create / edit flows share state cleanly.
//
// System roles (org_admin, hr_admin, manager, employee) are editable per
// org — the backend transparently forks the global template into an
// org-scoped copy on first edit so org A's edits don't leak into org B.
// =============================================================================

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Search,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Lock,
  Sparkles,
} from "lucide-react";
import api from "@/api/client";

interface Role {
  id: number;
  name: string;
  description: string | null;
  organization_id: number | null;
  type: number; // 0 = system, 1 = custom
  is_active: boolean;
  permissions: string[];
}

interface PermissionDef {
  key: string;
  label: string;
  group: string;
  scope?: "own" | "team" | "all";
  description: string;
}

interface CataloguePayload {
  permissions: PermissionDef[];
  grouped: Record<string, PermissionDef[]>;
  keys: string[];
}

// English fallbacks; the live UI resolves these via t(`roles.${name}`) so
// the active locale wins. Kept here so the modal placeholder + builder
// title can still read them when i18n isn't ready yet.
const SYSTEM_ROLE_LABELS: Record<string, string> = {
  org_admin: "Org Admin",
  hr_admin: "HR Admin",
  manager: "Manager",
  employee: "Employee",
};

export default function RolesPage() {
  const { t } = useTranslation();
  const tx = (k: string, opts?: Record<string, unknown>) =>
    t(`roles.page.${k}`, opts ?? {});
  // Localized role label resolver: system roles get the `roles.<name>` key,
  // custom roles fall through to the user-entered name.
  const localizedRoleName = (role: Role): string => {
    if (role.type === 0) {
      return t(`roles.${role.name}`, { defaultValue: SYSTEM_ROLE_LABELS[role.name] || role.name }) as string;
    }
    return role.name;
  };
  // System roles ship with English descriptions in the DB seed. Override
  // them client-side per locale so the cards localize too.
  const localizedRoleDescription = (role: Role): string | null => {
    if (role.type === 0) {
      return t(`roles.descriptions.${role.name}`, { defaultValue: role.description ?? "" }) as string;
    }
    return role.description;
  };
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ role: Role | null; mode: "create" | "edit" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);

  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ["roles-list"],
    queryFn: () => api.get("/roles").then((r) => r.data?.data ?? []),
  });

  const { data: catalogue } = useQuery<CataloguePayload>({
    queryKey: ["roles-permissions-catalogue"],
    queryFn: () => api.get("/roles/permissions").then((r) => r.data?.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/roles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles-list"] });
      setConfirmDelete(null);
    },
  });

  const systemRoles = roles.filter((r) => r.type === 0);
  const customRoles = roles.filter((r) => r.type === 1);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            {tx("title")}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{tx("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ role: null, mode: "create" })}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {tx("newCustomRole")}
        </button>
      </div>

      {/* System Roles */}
      <SectionHeader
        icon={<Lock className="h-4 w-4" />}
        title={tx("systemRolesTitle") as string}
        subtitle={tx("systemRolesSubtitle") as string}
      />
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-[13px] py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> {tx("loadingRoles")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          {systemRoles.length === 0 && (
            <p className="text-[13px] text-muted-foreground col-span-2">
              {tx("noSystemRoles")}
            </p>
          )}
          {systemRoles.map((r) => (
            <RoleCard
              key={`sys-${r.id}`}
              role={r}
              displayName={localizedRoleName(r)}
              displayDescription={localizedRoleDescription(r)}
              isCustomized={r.organization_id !== null}
              onEdit={() => setEditing({ role: r, mode: "edit" })}
              onReset={r.organization_id !== null ? () => setConfirmDelete(r) : undefined}
            />
          ))}
        </div>
      )}

      {/* Custom Roles */}
      <SectionHeader
        icon={<Sparkles className="h-4 w-4" />}
        title={tx("customRolesTitle") as string}
        subtitle={tx("customRolesSubtitle") as string}
      />
      {customRoles.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-4 text-center text-[13px] text-muted-foreground">
          {tx("noCustomRolesPrefix")}{" "}
          <button
            onClick={() => setEditing({ role: null, mode: "create" })}
            className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
          >
            {tx("noCustomRolesCreateOne")}
          </button>{" "}
          {tx("noCustomRolesSuffix")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {customRoles.map((r) => (
            <RoleCard
              key={`custom-${r.id}`}
              role={r}
              displayName={localizedRoleName(r)}
              displayDescription={localizedRoleDescription(r)}
              onEdit={() => setEditing({ role: r, mode: "edit" })}
              onDelete={() => setConfirmDelete(r)}
            />
          ))}
        </div>
      )}

      {/* Editor modal */}
      {editing && catalogue && (
        <RoleBuilderModal
          mode={editing.mode}
          role={editing.role}
          catalogue={catalogue}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["roles-list"] });
            setEditing(null);
          }}
        />
      )}

      {/* Delete / reset confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          role={confirmDelete}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
          error={deleteMutation.isError ? extractApiError(deleteMutation.error) : null}
        />
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-[13px] font-semibold text-muted-foreground flex items-center gap-2">
        {icon} {title}
      </h2>
      <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{subtitle}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role card
// ---------------------------------------------------------------------------

function RoleCard({
  role,
  displayName,
  displayDescription,
  isCustomized,
  onEdit,
  onDelete,
  onReset,
}: {
  role: Role;
  displayName: string;
  displayDescription: string | null;
  isCustomized?: boolean;
  onEdit: () => void;
  onDelete?: () => void;
  onReset?: () => void;
}) {
  const { t } = useTranslation();
  const tx = (k: string, opts?: Record<string, unknown>) =>
    t(`roles.page.${k}`, opts ?? {});
  const isSystem = role.type === 0;

  return (
    <div className="border border-border rounded-lg bg-card p-4 hover:border-brand-500 dark:hover:border-brand-400 transition-colors duration-150">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground truncate">{displayName}</h3>
            {isSystem && (
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                {tx("badgeSystem")}
              </span>
            )}
            {isCustomized && (
              <span
                title={tx("badgeCustomizedTooltip") as string}
                className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded"
              >
                {tx("badgeCustomized")}
              </span>
            )}
          </div>
          {displayDescription && (
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{displayDescription}</p>
          )}
          <p className="text-[11px] text-muted-foreground mt-2 tabular-nums">
            {tx("permissionsCount", { count: role.permissions.length })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 text-muted-foreground hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 rounded"
            title={tx("editRoleTooltip") as string}
          >
            <Pencil className="h-4 w-4" />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded"
              title={tx("deleteRoleTooltip") as string}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="p-1.5 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded"
              title={tx("resetRoleTooltip") as string}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Builder modal — create or edit a role
// ---------------------------------------------------------------------------

function RoleBuilderModal({
  mode,
  role,
  catalogue,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  role: Role | null;
  catalogue: CataloguePayload;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const tx = (k: string, opts?: Record<string, unknown>) =>
    t(`roles.page.${k}`, opts ?? {});
  const isSystemRole = role?.type === 0;
  const [name, setName] = useState(role?.name || "");
  const [description, setDescription] = useState(role?.description || "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(role?.permissions || []),
  );
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(Object.keys(catalogue.grouped).slice(0, 3)),
  );

  const mutation = useMutation({
    mutationFn: (payload: { name: string; description: string | null; permissions: string[] }) => {
      if (mode === "edit" && role) {
        return api.put(`/roles/${role.id}`, payload).then((r) => r.data);
      }
      return api.post("/roles", payload).then((r) => r.data);
    },
    onSuccess: () => onSaved(),
  });

  const groups = useMemo(() => Object.entries(catalogue.grouped), [catalogue]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(([g, perms]) => [
        g,
        perms.filter(
          (p) =>
            p.key.toLowerCase().includes(q) ||
            p.label.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q),
        ),
      ] as [string, PermissionDef[]])
      .filter(([, perms]) => perms.length > 0);
  }, [groups, search]);

  const toggleOne = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleGroup = (perms: PermissionDef[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = perms.every((p) => next.has(p.key));
      if (allOn) perms.forEach((p) => next.delete(p.key));
      else perms.forEach((p) => next.add(p.key));
      return next;
    });
  };
  const toggleGroupOpen = (group: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleSave = () => {
    if (!name.trim()) return;
    mutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      permissions: [...selected],
    });
  };

  // Useful counts for the sticky header.
  const selectedCount = selected.size;
  const totalCount = catalogue.permissions.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">
              {mode === "create"
                ? tx("createCustomRoleTitle")
                : isSystemRole
                  ? tx("editSystemRoleTitle")
                  : tx("editRoleTitle")}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
              {tx("permissionsSelected", { selected: selectedCount, total: totalCount })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Name + description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">
                {tx("roleNameLabel")}
                {isSystemRole && (
                  <span className="text-[11px] font-normal text-muted-foreground ml-2">{tx("roleNameLocked")}</span>
                )}
              </label>
              <input
                type="text"
                value={
                  isSystemRole
                    ? (t(`roles.${name}`, { defaultValue: SYSTEM_ROLE_LABELS[name] || name }) as string)
                    : name
                }
                onChange={(e) => setName(e.target.value)}
                disabled={isSystemRole}
                placeholder={tx("roleNamePlaceholder") as string}
                className={`w-full border border-border rounded-md px-3 py-2 text-[13px] focus:ring-2 focus:ring-brand-500 ${
                  isSystemRole ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-card text-foreground"
                }`}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1">
                {tx("descriptionLabel")} <span className="text-[11px] font-normal text-muted-foreground">{tx("descriptionOptional")}</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tx("descriptionPlaceholder") as string}
                className="w-full border border-border rounded-md px-3 py-2 text-[13px] focus:ring-2 focus:ring-brand-500 bg-card text-foreground"
              />
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tx("searchPermissionsPlaceholder") as string}
              className="bg-card text-foreground w-full pl-10 pr-4 py-2 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Permission groups */}
          <div className="border border-border rounded-lg divide-y divide-border">
            {filteredGroups.length === 0 && (
              <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                {tx("noPermissionsMatch", { query: search })}
              </div>
            )}
            {filteredGroups.map(([group, perms]) => {
              const open = openGroups.has(group) || search.trim().length > 0;
              const groupSelectedCount = perms.filter((p) => selected.has(p.key)).length;
              const allOn = groupSelectedCount === perms.length;
              const someOn = groupSelectedCount > 0 && !allOn;
              return (
                <div key={group}>
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-muted hover:bg-muted-foreground/10 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleGroupOpen(group)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <input
                      type="checkbox"
                      checked={allOn}
                      ref={(el) => { if (el) el.indeterminate = someOn; }}
                      onChange={() => toggleGroup(perms)}
                      className="accent-brand-600"
                    />
                    <span className="font-medium text-[13px] text-foreground flex-1">{group}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {groupSelectedCount} / {perms.length}
                    </span>
                  </div>
                  {open && (
                    <div className="divide-y divide-border">
                      {perms.map((p) => (
                        <label
                          key={p.key}
                          className="flex items-start gap-3 px-3 py-2 hover:bg-brand-50/40 dark:hover:bg-brand-950/30 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(p.key)}
                            onChange={() => toggleOne(p.key)}
                            className="mt-0.5 accent-brand-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] text-foreground">{p.label}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">{p.key}</span>
                              {p.scope && (
                                <span
                                  className={`text-[10px] font-semibold uppercase px-1 py-0.5 rounded ${
                                    p.scope === "all"
                                      ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                                      : p.scope === "team"
                                        ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                                        : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {p.scope}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">{p.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 flex items-center justify-between gap-3">
          {mutation.isError && (
            <span className="text-[11px] text-red-600 dark:text-red-400">{extractApiError(mutation.error)}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium text-muted-foreground border border-border rounded-md hover:bg-muted"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim() || mutation.isPending}
              className="px-4 py-2 text-[13px] font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {mode === "create" ? tx("createRoleButton") : tx("saveChanges")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation dialog (delete / reset)
// ---------------------------------------------------------------------------

function ConfirmDialog({
  role,
  isPending,
  onConfirm,
  onCancel,
  error,
}: {
  role: Role;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  error: string | null;
}) {
  const { t } = useTranslation();
  const tx = (k: string, opts?: Record<string, unknown>) =>
    t(`roles.page.${k}`, opts ?? {});
  const isReset = role.type === 0 && role.organization_id !== null;
  const displayName = role.type === 0
    ? (t(`roles.${role.name}`, { defaultValue: SYSTEM_ROLE_LABELS[role.name] || role.name }) as string)
    : role.name;
  const title = isReset ? tx("resetTitle") : tx("deleteTitle");
  const verb = isReset ? tx("resetButton") : tx("deleteButton");
  const body = isReset
    ? tx("resetBody", { name: displayName })
    : tx("deleteBody", { name: displayName });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isReset ? "bg-amber-50 dark:bg-amber-950/40" : "bg-red-50 dark:bg-red-950/40"}`}>
              <AlertTriangle className={`h-5 w-5 ${isReset ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`} />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          </div>
          <p className="text-[13px] text-muted-foreground">{body}</p>
          {error && <p className="text-[13px] text-red-600 dark:text-red-400 mt-3">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[13px] font-medium text-muted-foreground border border-border rounded-md hover:bg-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`px-4 py-2 text-[13px] font-medium text-white rounded-md disabled:opacity-50 flex items-center gap-2 ${
              isReset ? "bg-amber-600 hover:bg-amber-700" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {verb}
          </button>
        </div>
      </div>
    </div>
  );
}

// extractApiError stays untranslated by design: it returns server-side error
// messages verbatim so they aren't lossy in logs. Only the final-fallback
// string was previously hardcoded — that one goes through i18n at call site.
function extractApiError(err: any): string {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    "Request failed"
  );
}
