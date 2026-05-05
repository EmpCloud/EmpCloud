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

const SYSTEM_ROLE_LABELS: Record<string, string> = {
  org_admin: "Org Admin",
  hr_admin: "HR Admin",
  manager: "Manager",
  employee: "Employee",
};

export default function RolesPage() {
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
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-brand-600" />
            Roles & Permissions
          </h1>
          <p className="text-gray-500 mt-1">
            Manage who can do what. System roles ship with sensible defaults; create
            custom roles for finer control.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ role: null, mode: "create" })}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New custom role
        </button>
      </div>

      {/* System Roles */}
      <SectionHeader
        icon={<Lock className="h-4 w-4" />}
        title="System roles"
        subtitle="Built-in templates. Editable per-org — your edits don't affect other organizations."
      />
      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading roles…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          {systemRoles.length === 0 && (
            <p className="text-sm text-gray-400 col-span-2">
              No system roles found. Run the seed migration?
            </p>
          )}
          {systemRoles.map((r) => (
            <RoleCard
              key={`sys-${r.id}`}
              role={r}
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
        title="Custom roles"
        subtitle="Created by your organization. Assign to users on each user's profile page."
      />
      {customRoles.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center text-sm text-gray-500">
          No custom roles yet.{" "}
          <button
            onClick={() => setEditing({ role: null, mode: "create" })}
            className="text-brand-600 hover:underline font-medium"
          >
            Create one
          </button>{" "}
          to grant fine-grained access without changing a user's primary role.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {customRoles.map((r) => (
            <RoleCard
              key={`custom-${r.id}`}
              role={r}
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
      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        {icon} {title}
      </h2>
      <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role card
// ---------------------------------------------------------------------------

function RoleCard({
  role,
  isCustomized,
  onEdit,
  onDelete,
  onReset,
}: {
  role: Role;
  isCustomized?: boolean;
  onEdit: () => void;
  onDelete?: () => void;
  onReset?: () => void;
}) {
  const isSystem = role.type === 0;
  const displayName = isSystem ? SYSTEM_ROLE_LABELS[role.name] || role.name : role.name;

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{displayName}</h3>
            {isSystem && (
              <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                system
              </span>
            )}
            {isCustomized && (
              <span
                title="This org has customized this system role. Reset to revert to the global default."
                className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded"
              >
                customized
              </span>
            )}
          </div>
          {role.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{role.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded"
            title="Edit role"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
              title="Delete role"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded"
              title="Reset to default"
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">
              {mode === "create" ? "Create custom role" : `Edit ${isSystemRole ? "system role" : "role"}`}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {selectedCount} of {totalCount} permissions selected
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Name + description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role name
                {isSystemRole && (
                  <span className="text-xs font-normal text-gray-400 ml-2">(system role — name locked)</span>
                )}
              </label>
              <input
                type="text"
                value={isSystemRole ? SYSTEM_ROLE_LABELS[name] || name : name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSystemRole}
                placeholder="e.g. Payroll Approver"
                className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 ${
                  isSystemRole ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""
                }`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this role is for…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search permissions by name, key, or description…"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Permission groups */}
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {filteredGroups.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No permissions match "{search}".
              </div>
            )}
            {filteredGroups.map(([group, perms]) => {
              const open = openGroups.has(group) || search.trim().length > 0;
              const groupSelectedCount = perms.filter((p) => selected.has(p.key)).length;
              const allOn = groupSelectedCount === perms.length;
              const someOn = groupSelectedCount > 0 && !allOn;
              return (
                <div key={group}>
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100">
                    <button
                      type="button"
                      onClick={() => toggleGroupOpen(group)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <input
                      type="checkbox"
                      checked={allOn}
                      ref={(el) => { if (el) el.indeterminate = someOn; }}
                      onChange={() => toggleGroup(perms)}
                    />
                    <span className="font-medium text-sm text-gray-800 flex-1">{group}</span>
                    <span className="text-xs text-gray-400">
                      {groupSelectedCount} / {perms.length}
                    </span>
                  </div>
                  {open && (
                    <div className="divide-y divide-gray-50">
                      {perms.map((p) => (
                        <label
                          key={p.key}
                          className="flex items-start gap-3 px-3 py-2 hover:bg-brand-50/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(p.key)}
                            onChange={() => toggleOne(p.key)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-900">{p.label}</span>
                              <span className="text-[10px] font-mono text-gray-400">{p.key}</span>
                              {p.scope && (
                                <span
                                  className={`text-[10px] font-semibold uppercase px-1 py-0.5 rounded ${
                                    p.scope === "all"
                                      ? "bg-red-50 text-red-600"
                                      : p.scope === "team"
                                        ? "bg-amber-50 text-amber-700"
                                        : "bg-gray-100 text-gray-500"
                                  }`}
                                >
                                  {p.scope}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">{p.description}</p>
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
        <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between gap-3">
          {mutation.isError && (
            <span className="text-xs text-red-600">{extractApiError(mutation.error)}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim() || mutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {mode === "create" ? "Create role" : "Save changes"}
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
  const isReset = role.type === 0 && role.organization_id !== null;
  const title = isReset ? "Reset to default?" : "Delete custom role?";
  const verb = isReset ? "Reset" : "Delete";
  const body = isReset
    ? `Reset "${SYSTEM_ROLE_LABELS[role.name] || role.name}" to its system default permissions? Your customization will be discarded.`
    : `Delete the custom role "${role.name}"? This will remove it from any user it's assigned to.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isReset ? "bg-amber-50" : "bg-red-50"}`}>
              <AlertTriangle className={`h-5 w-5 ${isReset ? "text-amber-600" : "text-red-600"}`} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          <p className="text-sm text-gray-600">{body}</p>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 flex items-center gap-2 ${
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

function extractApiError(err: any): string {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    "Request failed"
  );
}
