import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, Download, Upload, X, CheckCircle2, AlertTriangle, Loader2, Pencil, Trash2, UserPlus, UserCheck, Mail, FileSpreadsheet, KeyRound, Eye, EyeOff, Copy, Send, Users, Building2, Briefcase, MapPin, IdCard, LayoutGrid, List, SlidersHorizontal, ArrowUpDown, MoreVertical } from "lucide-react";
import api from "@/api/client";
import { useDepartments, useInviteUser } from "@/api/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions } from "@/lib/use-permissions";
import CsvImportUsersModal from "@/components/CsvImportUsersModal";
import { showToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import CustomRolesField from "@/components/employees/CustomRolesField";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Export / Import helpers
// ---------------------------------------------------------------------------

const EXPORT_COLUMNS = [
  "id", "emp_code", "first_name", "last_name", "email", "contact_number",
  "designation", "department_name", "location_name", "employment_type",
  "gender", "date_of_birth", "date_of_joining", "role", "address", "reporting_manager",
];

const EXPORT_HEADERS: Record<string, string> = {
  id: "ID", emp_code: "Emp Code", first_name: "First Name", last_name: "Last Name",
  email: "Email", contact_number: "Contact", designation: "Designation",
  department_name: "Department", location_name: "Location", employment_type: "Employment Type",
  gender: "Gender", date_of_birth: "Date of Birth", date_of_joining: "Date of Joining",
  role: "Role", address: "Address", reporting_manager: "Reporting Manager",
};

function formatDate(val: any): string {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  return d.toISOString().split("T")[0];
}

function exportToExcel(employees: any[]) {
  const data = employees.map((emp) => {
    const row: Record<string, any> = {};
    EXPORT_COLUMNS.forEach((col) => {
      const label = EXPORT_HEADERS[col] || col;
      let val = emp[col] ?? "";
      if (col === "date_of_birth" || col === "date_of_joining") val = formatDate(val);
      row[label] = val;
    });
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);

  // Auto-width columns
  const colWidths = Object.keys(EXPORT_HEADERS).map((col) => {
    const label = EXPORT_HEADERS[col];
    const maxLen = Math.max(label.length, ...employees.map((e) => String(e[col] ?? "").length));
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, `employees_${new Date().toISOString().split("T")[0]}.xlsx`);
}

function parseUploadedFile(file: File): Promise<any[]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      // Map display headers back to field names
      const headerToField = Object.fromEntries(
        Object.entries(EXPORT_HEADERS).map(([k, v]) => [v, k])
      );

      const mapped = rows.map((row: any) => {
        const out: any = {};
        Object.entries(row).forEach(([key, val]) => {
          const field = headerToField[key] || key;
          out[field] = val;
        });
        if (out.id) out.id = Number(out.id);
        return out;
      });
      resolve(mapped);
    };
    reader.readAsArrayBuffer(file);
  });
}


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmployeeDirectoryPage() {
  const { t } = useTranslation();
  const tx = (k: string, opts?: Record<string, unknown>) =>
    t(`employees.directory.${k}`, opts ?? {});
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isOrgAdmin = currentUser?.role === "org_admin" || currentUser?.role === "super_admin";
  const canDelete = isOrgAdmin;
  // Custom roles with employees:invite (no built-in admin role) should still
  // see the invite workflow -- the route layer already accepts the permission
  // alongside org_admin.
  const { has } = usePermissions();
  const canInvite = isOrgAdmin || has("employees:invite");
  const canEditAll = has("employees:edit_all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("grid");
  const [sortOrder, setSortOrder] = useState<"name_asc" | "name_desc" | "newest">("name_asc");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [openCardMenu, setOpenCardMenu] = useState<{ id: number; anchor: "header" | "footer" } | null>(null);
  const [openTableMenuId, setOpenTableMenuId] = useState<number | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(() => new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [uploadRows, setUploadRows] = useState<any[]>([]);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [editTargetId, setEditTargetId] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // Invite Employee — absorbed from the retired Users page.
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("employee");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteError, setInviteError] = useState("");
  // When the typed email matches an existing user in this org, we
  // prefill First/Last Name from that record and lock those inputs.
  // The submit handler then routes to /users/:id/invite (re-invite path)
  // instead of /users/invite (which rejects existing emails).
  const [existingUserMatch, setExistingUserMatch] = useState<
    { id: number; first_name: string | null; last_name: string | null; role: string } | null
  >(null);
  const inviteUser = useInviteUser();

  // Debounced lookup: when the typed email parses, ask the backend
  // whether a user with that email already exists in the org. 350ms
  // matches the directory search debounce so the feel is consistent.
  useEffect(() => {
    if (!showInvite) {
      setExistingUserMatch(null);
      return;
    }
    const trimmed = inviteEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setExistingUserMatch(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api
        .get("/users/lookup", { params: { email: trimmed }, signal: ctrl.signal })
        .then((r) => r.data.data)
        .then((res: any) => {
          if (res?.exists) {
            setExistingUserMatch({
              id: res.id,
              first_name: res.first_name,
              last_name: res.last_name,
              role: res.role,
            });
            setInviteFirstName(res.first_name ?? "");
            setInviteLastName(res.last_name ?? "");
            setInviteRole(res.role || "employee");
          } else {
            setExistingUserMatch(null);
          }
        })
        .catch(() => {
          // Silent — if lookup fails, fall back to the new-user path
          // and let the submit-time validation surface any real error.
          setExistingUserMatch(null);
        });
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [inviteEmail, showInvite]);

  // Bulk CSV import (create new employees) — also absorbed from Users page.
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showPendingInvitations, setShowPendingInvitations] = useState(false);

  // Admin password reset inside the Edit modal. Password fields are
  // deliberately kept OUT of the bulk-update payload — they submit
  // separately via POST /users/:id/reset-password so the audit trail
  // is a distinct PASSWORD_RESET event, and the mass-assignment
  // whitelist on updateUser() stays closed.
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const resetPassword = useMutation({
    mutationFn: ({ userId, password }: { userId: number; password: string }) =>
      api.post(`/users/${userId}/reset-password`, { password }).then((r) => r.data),
    onSuccess: () => {
      setPasswordError(null);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || "Failed to reset password";
      setPasswordError(msg);
    },
  });

  // Per-row Invite button — independent of the existing bulk Invite
  // Employee modal. Hits POST /users/:id/invite (the directory-aware
  // endpoint that handles existing users via re-invitation), NOT the
  // /users/invite endpoint, which rejects every row because the email
  // already exists in the users table.
  const [invitingId, setInvitingId] = useState<number | null>(null);
  const sendDirectInvite = useMutation({
    mutationFn: (userId: number) =>
      api.post(`/users/${userId}/invite`).then((r) => r.data.data),
    onSuccess: (result: { status?: "invited" | "resent" }) => {
      showToast(
        "success",
        result?.status === "resent" ? "Invitation resent." : "Invitation sent.",
      );
      qc.invalidateQueries({ queryKey: ["pending-invitations"] });
    },
    onError: (err: any) => {
      showToast(
        "error",
        err?.response?.data?.error?.message || "Could not send invitation.",
      );
    },
    onSettled: () => setInvitingId(null),
  });

  // Pending invitations panel — fetched for anyone who can invite.
  const { data: pendingInvitations } = useQuery({
    queryKey: ["pending-invitations"],
    queryFn: () =>
      api
        .get("/users/invitations", { params: { status: "pending" } })
        .then((r) => r.data.data)
        .catch(() => [] as any[]),
    enabled: canInvite,
  });
  const invitations: any[] = (pendingInvitations as any[]) || [];

  // Re-send a single pending invitation. Rotates the token server-side
  // (so any old link the user might still have stops working) and
  // re-emails them.
  const resendInvitation = useMutation({
    mutationFn: (invitationId: number) =>
      api.post(`/users/invitations/${invitationId}/resend`).then((r) => r.data.data),
    onSuccess: (_data, _id) => {
      showToast("success", "Invitation resent.");
      qc.invalidateQueries({ queryKey: ["pending-invitations"] });
    },
    onError: (err: any) => {
      showToast(
        "error",
        err?.response?.data?.error?.message || "Could not resend the invitation.",
      );
    },
  });

  // Cancel a pending invitation. When the matching user has never
  // activated, the server hard-deletes them in the same transaction
  // (returns user_deleted: true) so HR doesn't have a phantom account
  // sitting in the directory. Activated users are left alone — admin
  // must use the per-row delete on the directory itself if they want
  // to remove an active account.
  // Confirm-cancel dialog state (replaces window.confirm). Holds the
  // invitation awaiting confirmation so the dialog can show its email.
  const [cancelInviteTarget, setCancelInviteTarget] = useState<{ id: number; email: string } | null>(null);

  const cancelInvitation = useMutation({
    mutationFn: (invitationId: number) =>
      api.delete(`/users/invitations/${invitationId}`).then((r) => r.data.data as { email: string; user_deleted: boolean }),
    onSuccess: (data) => {
      showToast(
        "success",
        data.user_deleted
          ? `Invitation cancelled and ${data.email} removed from the directory.`
          : `Invitation to ${data.email} cancelled.`,
      );
      qc.invalidateQueries({ queryKey: ["pending-invitations"] });
      qc.invalidateQueries({ queryKey: ["employee-directory"] });
      setCancelInviteTarget(null);
    },
    onError: (err: any) => {
      showToast(
        "error",
        err?.response?.data?.error?.message || "Could not cancel the invitation.",
      );
    },
  });

  // Bulk-invite every directory user who hasn't set a password yet and
  // doesn't already have a pending invitation. Backend respects the org's
  // seat limit and refuses the whole batch if it would overflow.
  const [showBulkInviteConfirm, setShowBulkInviteConfirm] = useState(false);
  // Opt-in: also re-invite users who already activated. Sends them a fresh
  // token-based link that, once clicked, overwrites their current password.
  // Effectively a bulk password-reset. Default off because the common case
  // is "onboard new joiners" and we don't want HR to nuke existing
  // passwords by accident.
  const [bulkInviteIncludeActivated, setBulkInviteIncludeActivated] = useState(false);
  const bulkInvite = useMutation({
    mutationFn: (includeActivated: boolean) =>
      api
        .post("/users/bulk-invite-employees", { include_activated: includeActivated })
        .then((r) => r.data.data),
    onSuccess: (data: { invited: number; skipped: number; total_eligible: number }) => {
      setShowBulkInviteConfirm(false);
      setBulkInviteIncludeActivated(false);
      qc.invalidateQueries({ queryKey: ["pending-invitations"] });
      qc.invalidateQueries({ queryKey: ["employee-directory"] });
      if (data.invited === 0) {
        showToast(
          "success",
          data.total_eligible === 0
            ? "Nothing to do — every employee has an account or a pending invitation."
            : `Skipped ${data.skipped} (already invited). Nothing else to send.`,
        );
      } else {
        showToast(
          "success",
          `Invited ${data.invited} employee${data.invited === 1 ? "" : "s"}` +
            (data.skipped > 0 ? ` (${data.skipped} already had pending invites)` : "") +
            ".",
        );
      }
    },
    onError: (err: any) => {
      setShowBulkInviteConfirm(false);
      setBulkInviteIncludeActivated(false);
      showToast(
        "error",
        err?.response?.data?.error?.message || "Bulk invite failed.",
      );
    },
  });

  const fileRef = useRef<HTMLInputElement>(null);

  const { data: departments } = useDepartments();

  // Locations dropdown — shared between the Location filter and the edit modal.
  const { data: locations } = useQuery({
    queryKey: ["org-locations"],
    queryFn: () => api.get("/organizations/me/locations").then((r) => r.data.data),
    staleTime: 60000,
  });

  const { data, isLoading } = useQuery({
    queryKey: [
      "employee-directory",
      {
        page,
        search: search || undefined,
        department_id: departmentId || undefined,
        location_id: locationId || undefined,
        role: roleFilter || undefined,
        status: statusFilter,
      },
    ],
    queryFn: () =>
      api
        .get("/employees/directory", {
          params: {
            page,
            per_page: 12,
            ...(search ? { search } : {}),
            ...(departmentId ? { department_id: departmentId } : {}),
            ...(locationId ? { location_id: locationId } : {}),
            ...(roleFilter ? { role: roleFilter } : {}),
            status: statusFilter,
          },
        })
        .then((r) => r.data),
  });

  const { data: directoryStats, isLoading: statsLoading } = useQuery({
    queryKey: ["employee-directory-stats"],
    queryFn: () => api.get("/employees/directory/stats").then((r) => r.data.data),
  });

  const exportQuery = useQuery({
    queryKey: ["employee-export"],
    queryFn: () => api.get("/employees/export").then((r) => r.data.data),
    enabled: false,
  });

  const bulkUpdate = useMutation({
    mutationFn: (rows: any[]) => api.post("/employees/bulk-update", { rows }).then((r) => r.data.data),
    onSuccess: (data) => {
      setUploadResult(data);
      qc.invalidateQueries({ queryKey: ["employee-directory"] });
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`).then((r) => r.data),
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["employee-directory"] });
    },
  });

  const { data: editEmployee, isLoading: editLoading } = useQuery({
    queryKey: ["employee-edit", editTargetId],
    queryFn: () => api.get(`/employees/${editTargetId}`).then((r) => r.data.data),
    enabled: editTargetId !== null,
  });

  const updateEmployee = useMutation({
    mutationFn: (row: any) =>
      api.post("/employees/bulk-update", { rows: [row] }).then((r) => r.data.data),
    onSuccess: (data) => {
      const detail = data?.details?.[0];
      if (detail?.status === "error") {
        setEditError(detail.error || "Update failed");
        return;
      }
      setEditTargetId(null);
      setEditError(null);
      qc.invalidateQueries({ queryKey: ["employee-directory"] });
    },
    onError: (err: any) => {
      setEditError(err?.response?.data?.error?.message || "Update failed");
    },
  });

  const handleDownload = async () => {
    const result = await exportQuery.refetch();
    if (result.data) {
      exportToExcel(result.data);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rows = await parseUploadedFile(file);
    setUploadRows(rows);
    setUploadResult(null);
    setShowUpload(true);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleBulkSubmit = () => {
    if (uploadRows.length === 0) return;
    bulkUpdate.mutate(uploadRows);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    try {
      // Existing-user path: fire the directory-aware re-invite endpoint.
      // First/last name aren't sent because the server reads them from
      // the existing user row — keeping the modal inputs disabled +
      // inviting via :id/invite avoids any chance of accidental rename.
      if (existingUserMatch) {
        await api.post(`/users/${existingUserMatch.id}/invite`);
        showToast("success", "Invitation resent.");
      } else {
        // Fresh-email path: existing /users/invite endpoint, now also
        // carrying first/last name so the welcome email greets the
        // recipient by name on first activation.
        await inviteUser.mutateAsync({
          email: inviteEmail,
          role: inviteRole as any,
          first_name: inviteFirstName || undefined,
          last_name: inviteLastName || undefined,
        });
        showToast("success", "Invitation sent.");
      }
      setInviteEmail("");
      setInviteRole("employee");
      setInviteFirstName("");
      setInviteLastName("");
      setExistingUserMatch(null);
      setShowInvite(false);
      qc.invalidateQueries({ queryKey: ["pending-invitations"] });
    } catch (err: any) {
      setInviteError(err?.response?.data?.error?.message || "Failed to send invitation");
    }
  };

  const employees = useMemo(() => {
    const rows = [...(data?.data || [])];
    return rows.sort((first: any, second: any) => {
      if (sortOrder === "newest") {
        return new Date(second.date_of_joining || 0).getTime() - new Date(first.date_of_joining || 0).getTime();
      }
      const firstName = `${first.first_name || ""} ${first.last_name || ""}`.trim();
      const secondName = `${second.first_name || ""} ${second.last_name || ""}`.trim();
      return sortOrder === "name_desc"
        ? secondName.localeCompare(firstName)
        : firstName.localeCompare(secondName);
    });
  }, [data?.data, sortOrder]);
  const meta = data?.meta;
  const deptList = departments || [];
  const locationById = new Map<string, string>(
    (locations || []).map((location: any): [string, string] => [String(location.id), String(location.name)]),
  );
  const activeRate = directoryStats?.total_employees
    ? Math.round((directoryStats.active_employees / directoryStats.total_employees) * 100)
    : 0;
  const visibleStart = meta?.total ? (meta.page - 1) * meta.per_page + 1 : 0;
  const visibleEnd = meta?.total ? Math.min(meta.page * meta.per_page, meta.total) : 0;
  const pageEmployeeIds = employees.map((employee: any) => Number(employee.id));
  const allPageEmployeesSelected = pageEmployeeIds.length > 0 && pageEmployeeIds.every((id: number) => selectedEmployeeIds.has(id));
  const somePageEmployeesSelected = pageEmployeeIds.some((id: number) => selectedEmployeeIds.has(id));
  const roleLabel = (role: string) => {
    const labels: Record<string, string> = {
      employee: tx("roleEmployee") as string,
      manager: tx("roleManager") as string,
      hr_admin: tx("roleHrAdmin") as string,
      org_admin: tx("roleOrgAdmin") as string,
    };
    return labels[role] || role.replace(/_/g, " ");
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] pb-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{tx("title")}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{tx("subtitle")}</p>
        </div>
      </div>

      <section aria-label={tx("workforceOverview") as string} className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_220px]">
        {statsLoading ? (
          Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-[76px] animate-pulse rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="mt-2 h-5 w-14 rounded bg-muted" />
            </div>
          ))
        ) : (
          <>
            <div className="flex min-h-[76px] items-center gap-3 rounded-xl border border-blue-100 bg-card p-3 shadow-sm dark:border-blue-900/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <Users aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">{tx("totalEmployees")}</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{directoryStats?.total_employees ?? 0}</p>
              </div>
            </div>
            <div className="flex min-h-[76px] items-center gap-3 rounded-xl border border-emerald-100 bg-card p-3 shadow-sm dark:border-emerald-900/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <UserCheck aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">{tx("activeEmployees")}</p>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <p className="text-xl font-bold tabular-nums text-foreground">{directoryStats?.active_employees ?? 0}</p>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{activeRate}%</span>
                </div>
              </div>
            </div>
            <div className="flex min-h-[76px] items-center gap-3 rounded-xl border border-violet-100 bg-card p-3 shadow-sm dark:border-violet-900/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                <Building2 aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">{tx("departments")}</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{deptList.length}</p>
              </div>
            </div>
            <div className="flex min-h-[76px] items-center gap-3 rounded-xl border border-orange-100 bg-card p-3 shadow-sm dark:border-orange-900/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
                <UserPlus aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">{tx("newJoinersThisMonth")}</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{directoryStats?.new_joiners_this_month ?? 0}</p>
              </div>
            </div>
          </>
        )}
        {canInvite && (
          <div className="flex min-h-[76px] items-start justify-end pt-1 sm:col-span-2 xl:col-span-1">
            <button
              type="button"
              onClick={() => setShowInvite((value) => !value)}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <UserPlus aria-hidden="true" className="h-4 w-4" />
              {tx("inviteEmployee")}
            </button>
          </div>
        )}
      </section>

      {/* Bulk-invite confirmation. Server enforces seat limits and skips
           anyone with a pending invite, but a friendly heads-up is still
           the right UX before firing N emails. */}
      {canInvite && showBulkInviteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !bulkInvite.isPending && setShowBulkInviteConfirm(false)}
        >
          <div
            className="w-full max-w-md bg-card rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center text-brand-700 dark:text-brand-300">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {bulkInviteIncludeActivated
                    ? "Invite all employees"
                    : "Invite all unactivated employees"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {bulkInviteIncludeActivated
                    ? "This sends a fresh invitation email to every active employee in the directory — including users who have already set a password. When they click the link, their existing password will be overwritten with the new one they pick."
                    : "This sends an invitation email to every active employee in the directory who hasn't set a password yet. Anyone with a pending invitation is skipped."}
                </p>
              </div>
            </div>

            {/* Opt-in to also re-invite already-activated users (bulk
                password reset). Off by default to prevent accidental
                mass-resets. */}
            <label className="mt-2 mb-2 flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2 cursor-pointer hover:bg-muted">
              <input
                type="checkbox"
                checked={bulkInviteIncludeActivated}
                onChange={(e) => setBulkInviteIncludeActivated(e.target.checked)}
                disabled={bulkInvite.isPending}
                className="mt-0.5 h-4 w-4 rounded border-border text-brand-600 dark:text-brand-400 focus:ring-brand-500"
              />
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Also re-invite already-activated employees</span>
                <p className="text-muted-foreground mt-0.5">
                  Existing users will receive a fresh link. Clicking it resets their current password.
                </p>
              </div>
            </label>

            {bulkInviteIncludeActivated && (
              <div className="mb-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <strong>Heads-up:</strong> every active employee will receive a fresh invitation email.
                Their current password will be overwritten when they click the link.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkInviteConfirm(false)}
                disabled={bulkInvite.isPending}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => bulkInvite.mutate(bulkInviteIncludeActivated)}
                disabled={bulkInvite.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {bulkInvite.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {bulkInvite.isPending ? "Inviting..." : "Send Invitations"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV import modal — absorbed from the retired Users page */}
      {showCsvImport && (
        <CsvImportUsersModal
          onClose={() => setShowCsvImport(false)}
          invalidateKeys={["employee-directory"]}
        />
      )}

      {/* Invite form (absorbed from the retired Users page) */}
      {showInvite && canInvite && (
        <form
          onSubmit={handleInvite}
          className="bg-card rounded-xl border border-border p-6 mb-6 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="block text-sm font-medium text-muted-foreground mb-1">Email *</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
                placeholder="colleague@company.com"
                required
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-muted-foreground mb-1">First Name</label>
              <input
                type="text"
                value={inviteFirstName}
                onChange={(e) => setInviteFirstName(e.target.value)}
                disabled={!!existingUserMatch}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
                placeholder="Jane"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-muted-foreground mb-1">Last Name</label>
              <input
                type="text"
                value={inviteLastName}
                onChange={(e) => setInviteLastName(e.target.value)}
                disabled={!!existingUserMatch}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
                placeholder="Doe"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                disabled={!!existingUserMatch}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="hr_admin">HR Admin</option>
                <option value="org_admin">Org Admin</option>
              </select>
            </div>
          </div>
          {/* Hint when an existing user is detected — explains why the
              fields just locked. Without this the disabled inputs feel
              like a glitch to anyone seeing it for the first time. */}
          {existingUserMatch && (
            <p className="text-xs text-muted-foreground">
              Existing employee detected — name and role are locked. Submitting will resend their invitation.
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={inviteUser.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              {inviteUser.isPending
                ? "Sending..."
                : existingUserMatch
                  ? "Resend Invite"
                  : "Send Invite"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowInvite(false);
                setInviteError("");
                setInviteFirstName("");
                setInviteLastName("");
                setExistingUserMatch(null);
              }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          {inviteError && <p className="text-sm text-red-600 dark:text-red-400">{inviteError}</p>}
        </form>
      )}

      {/* Pending Invitations modal — opened via the action-bar button so the
          directory page stays uncluttered when many invitations are queued. */}
      {canInvite && showPendingInvitations && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowPendingInvitations(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-card rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center text-amber-700 dark:text-amber-300">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Pending Invitations
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {invitations.length} invitation{invitations.length === 1 ? "" : "s"} waiting to be accepted
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPendingInvitations(false)}
                aria-label={t("common.close")}
                className="text-muted-foreground hover:text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No pending invitations.
                </p>
              ) : (
                <div className="space-y-2">
                  {invitations.map((inv: any) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between rounded-lg px-4 py-3 border border-amber-100 bg-amber-50/40"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 flex-shrink-0 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center text-amber-700 dark:text-amber-300">
                          <Mail className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {inv.email}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {(inv.role || "employee").replace(/_/g, " ")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full font-medium">
                          Pending
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Invited{" "}
                          {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => resendInvitation.mutate(inv.id)}
                          disabled={
                            resendInvitation.isPending && resendInvitation.variables === inv.id
                          }
                          title="Rotate token and re-send invitation email"
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-card px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/40 disabled:opacity-50"
                        >
                          {resendInvitation.isPending && resendInvitation.variables === inv.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                          Resend
                        </button>
                        <button
                          type="button"
                          onClick={() => setCancelInviteTarget({ id: inv.id, email: inv.email })}
                          disabled={
                            cancelInvitation.isPending && cancelInvitation.variables === inv.id
                          }
                          title={t("common.cancelInvitationTooltip")}
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-card px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                        >
                          {cancelInvitation.isPending && cancelInvitation.variables === inv.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-6 py-3 border-t border-border">
              <button
                type="button"
                onClick={() => setShowPendingInvitations(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Preview Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Bulk Update Preview</h3>
                <p className="text-xs text-muted-foreground">{uploadRows.length} rows parsed from file</p>
              </div>
              <button onClick={() => { setShowUpload(false); setUploadRows([]); setUploadResult(null); }} className="text-muted-foreground hover:text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Result Banner */}
            {uploadResult && (
              <div className={`mx-6 mt-4 p-3 rounded-lg text-sm ${uploadResult.errors > 0 ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200" : "bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200"}`}>
                <div className="flex items-center gap-2">
                  {uploadResult.errors > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span className="font-medium">
                    {uploadResult.updated} updated, {uploadResult.unchanged} unchanged, {uploadResult.errors} errors
                  </span>
                </div>
              </div>
            )}

            {/* Preview Table — #1418: sticky header needs a z-index and
                 explicit background so scrolled rows no longer overlap it.
                 Cells use whitespace-nowrap to keep columns aligned. */}
            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="min-w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr>
                    {["ID", "Emp Code", "Name", "Email", "Designation", "Department", "Role"]
                      .concat(uploadResult ? ["Status"] : [])
                      .map((h) => (
                        <th
                          key={h}
                          className="sticky top-0 z-10 bg-muted text-left text-xs font-medium text-muted-foreground uppercase px-3 py-2 border-b border-border"
                        >
                          {h}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadRows.map((row, i) => {
                    const detail = uploadResult?.details?.[i];
                    return (
                      <tr key={i} className={detail?.status === "error" ? "bg-red-50 dark:bg-red-950/40" : ""}>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap border-b border-border">{row.id || "-"}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap border-b border-border">{row.emp_code || "-"}</td>
                        <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap border-b border-border">{row.first_name} {row.last_name}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap border-b border-border">{row.email || "-"}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap border-b border-border">{row.designation || "-"}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap border-b border-border">{row.department_name || "-"}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap border-b border-border">{row.role || "-"}</td>
                        {uploadResult && (
                          <td className="px-3 py-2 whitespace-nowrap border-b border-border">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              detail?.status === "updated" ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                                : detail?.status === "unchanged" ? "bg-muted text-muted-foreground"
                                : detail?.status === "error" ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                                : "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300"
                            }`}>
                              {detail?.status || "pending"}
                              {detail?.error && <span className="ml-1">({detail.error})</span>}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted rounded-b-2xl">
              <p className="text-xs text-muted-foreground">
                Edit the exported CSV, change values, and upload. The ID column identifies each employee.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowUpload(false); setUploadRows([]); setUploadResult(null); }}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted"
                >
                  {uploadResult ? "Close" : "Cancel"}
                </button>
                {!uploadResult && (
                  <button
                    onClick={handleBulkSubmit}
                    disabled={bulkUpdate.isPending || uploadRows.length === 0}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                  >
                    {bulkUpdate.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating...</> : <><Upload className="h-4 w-4" /> Apply Updates</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-2 rounded-xl border border-border bg-card p-1.5 shadow-sm">
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_180px_180px_160px_auto]">
          <label className="relative block">
            <span className="sr-only">{tx("searchPlaceholder")}</span>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="min-h-9 w-full rounded-lg border border-border bg-card py-1.5 pl-9 pr-3 text-xs text-foreground outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
              placeholder={tx("searchPlaceholder") as string}
            />
          </label>
          <select
            aria-label={tx("allDepartments") as string}
            value={departmentId}
            onChange={(event) => {
              setDepartmentId(event.target.value);
              setPage(1);
            }}
            className="min-h-9 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">{tx("allDepartments")}</option>
            {deptList.map((department: any) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
          <select
            aria-label={tx("allLocations") as string}
            value={locationId}
            onChange={(event) => {
              setLocationId(event.target.value);
              setPage(1);
            }}
            className="min-h-9 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">{tx("allLocations")}</option>
            {(locations || []).map((location: any) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
          <select
            aria-label={tx("allStatuses") as string}
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
            className="min-h-9 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="all">{tx("allStatuses")}</option>
            <option value="1">{tx("statusActive")}</option>
            <option value="0">{tx("statusInactive")}</option>
          </select>
          <button
            type="button"
            aria-expanded={showAdvancedFilters}
            onClick={() => setShowAdvancedFilters((value) => !value)}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300 dark:hover:bg-brand-950/40"
          >
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
            {tx("moreFilters")}
          </button>
        </div>
        {showAdvancedFilters && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
            <select
              aria-label={tx("allRoles") as string}
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value);
                setPage(1);
              }}
              className="min-h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 sm:w-52"
            >
              <option value="">{tx("allRoles")}</option>
              <option value="employee">{tx("roleEmployee")}</option>
              <option value="manager">{tx("roleManager")}</option>
              <option value="hr_admin">{tx("roleHrAdmin")}</option>
              <option value="org_admin">{tx("roleOrgAdmin")}</option>
            </select>
            <div className="flex flex-wrap items-center gap-2" aria-label="Directory actions">
              <button
                type="button"
                onClick={handleDownload}
                disabled={exportQuery.isFetching}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                {exportQuery.isFetching ? tx("exporting") : tx("exportExcel")}
              </button>
              {canEditAll && (
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">
                  <Upload aria-hidden="true" className="h-4 w-4" />
                  {tx("bulkUpdate")}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              )}
              {canInvite && (
                <button
                  type="button"
                  onClick={() => setShowPendingInvitations(true)}
                  className={`relative inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    invitations.length > 0
                      ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/40"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Mail aria-hidden="true" className="h-4 w-4" />
                  {tx("pendingInvitations")}
                  {invitations.length > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-600 px-1.5 text-[10px] font-semibold text-white">
                      {invitations.length}
                    </span>
                  )}
                </button>
              )}
              {isOrgAdmin && (
                <button
                  type="button"
                  onClick={() => setShowCsvImport(true)}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  <FileSpreadsheet aria-hidden="true" className="h-4 w-4" /> {tx("importEmployees")}
                </button>
              )}
              {canInvite && (
                <button
                  type="button"
                  onClick={() => setShowBulkInviteConfirm(true)}
                  disabled={bulkInvite.isPending}
                  title={tx("inviteAllTooltip") as string}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-50 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200 dark:hover:bg-brand-900/50"
                >
                  <Users aria-hidden="true" className="h-4 w-4" /> {tx("inviteAll")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-sm" role="group" aria-label={tx("viewMode") as string}>
          <button
            type="button"
            aria-pressed={viewMode === "table"}
            onClick={() => setViewMode("table")}
            className={`inline-flex min-h-8 items-center gap-2 rounded-md px-2.5 text-xs font-medium transition-colors ${viewMode === "table" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" : "text-muted-foreground hover:bg-muted"}`}
          >
            <List aria-hidden="true" className="h-4 w-4" /> {tx("tableView")}
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
            className={`inline-flex min-h-8 items-center gap-2 rounded-md px-2.5 text-xs font-medium transition-colors ${viewMode === "grid" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" : "text-muted-foreground hover:bg-muted"}`}
          >
            <LayoutGrid aria-hidden="true" className="h-4 w-4" /> {tx("gridView")}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-[11px] text-muted-foreground">
            {tx("showingEmployees", { shown: employees.length, from: visibleStart, to: visibleEnd, total: meta?.total ?? 0 })}
          </p>
          <label className="relative">
            <span className="sr-only">{tx("sortBy")}</span>
            <ArrowUpDown aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}
              className="min-h-8 rounded-lg border border-border bg-card py-1 pl-9 pr-8 text-xs font-medium text-foreground outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="name_asc">{tx("sortNameAsc")}</option>
              <option value="name_desc">{tx("sortNameDesc")}</option>
              <option value="newest">{tx("sortNewest")}</option>
            </select>
          </label>
        </div>
      </div>

      {/* Table */}
      {/* #1822 — `overscroll-x-contain` stops the horizontal rubber-band from
          chaining to the page when the user scroll-bounces left of position 0
          (where the negative `-mx-4` mobile bleed reveals the page edge under
          the rounded corner). On lg+ the card is inset and `rounded-xl` is
          fine, but on mobile the bleed + rounded corner combo leaks the
          gray-50 page bg through during overscroll, which is the visual
          glitch the reporter screenshotted. Flatten left/right corners
          on mobile so there's nothing to leak through. */}
      <div className={viewMode === "table" ? "-mx-4 overflow-x-auto overscroll-x-contain rounded-none border-y border-border bg-card lg:mx-0 lg:rounded-xl lg:border" : "min-w-0"}>
        {viewMode === "table" ? (
        <table className="w-full min-w-[1120px] table-fixed text-xs">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th className="w-10 px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={allPageEmployeesSelected}
                  ref={(element) => {
                    if (element) element.indeterminate = somePageEmployeesSelected && !allPageEmployeesSelected;
                  }}
                  aria-checked={allPageEmployeesSelected ? "true" : somePageEmployeesSelected ? "mixed" : "false"}
                  aria-label={tx("selectAllEmployees") as string}
                  onChange={() => setSelectedEmployeeIds((current) => {
                    const next = new Set(current);
                    if (allPageEmployeesSelected) pageEmployeeIds.forEach((id: number) => next.delete(id));
                    else pageEmployeeIds.forEach((id: number) => next.add(id));
                    return next;
                  })}
                  className="h-3.5 w-3.5 rounded border-border accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                />
              </th>
              {[
                [tx("colEmployee"), "w-[180px]"],
                [tx("colEmail"), "w-[210px]"],
                [t("common.department"), "w-[150px]"],
                [tx("colDesignation"), "w-[190px]"],
                [tx("location"), "w-[140px]"],
                [tx("employeeType"), "w-[120px]"],
                [t("common.status"), "w-[110px]"],
              ].map(([label, width]) => (
                <th key={String(label)} className={`${width} px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-600 dark:text-slate-300`}>
                  <span className="inline-flex items-center gap-1">
                    {label}
                    <ArrowUpDown aria-hidden="true" className="h-2.5 w-2.5 opacity-60" />
                  </span>
                </th>
              ))}
              <th className="w-[120px] px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-600 dark:text-slate-300">
                {t("common.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-3 py-2"><div className="h-3.5 w-3.5 rounded bg-muted" /></td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-muted" />
                        <div className="h-3 w-24 rounded bg-muted" />
                      </div>
                    </td>
                    <td className="px-3 py-2"><div className="h-3 w-32 rounded bg-muted" /></td>
                    <td className="px-3 py-2"><div className="h-3 w-20 rounded bg-muted" /></td>
                    <td className="px-3 py-2"><div className="h-3 w-24 rounded bg-muted" /></td>
                    <td className="px-3 py-2"><div className="h-5 w-16 rounded-full bg-muted" /></td>
                    <td className="px-3 py-2"><div className="h-3 w-16 rounded bg-muted" /></td>
                    <td className="px-3 py-2"><div className="h-5 w-14 rounded-full bg-muted" /></td>
                    <td className="px-3 py-2"><div className="ml-auto h-6 w-20 rounded bg-muted" /></td>
                  </tr>
                ))}
              </>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  {tx("noEmployees")}
                </td>
              </tr>
            ) : (
              employees.map((emp: any) => {
                const employeeId = Number(emp.id);
                const employeeName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
                const employeeLocation = locationById.get(String(emp.location_id)) || "-";
                const isSelected = selectedEmployeeIds.has(employeeId);
                return (
                <tr key={emp.id} className={`transition-colors ${isSelected ? "bg-blue-50/80 dark:bg-blue-950/25" : "hover:bg-blue-50/50 dark:hover:bg-blue-950/15"}`}>
                  <td className="px-3 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      aria-label={tx("selectEmployee", { name: employeeName }) as string}
                      onChange={() => setSelectedEmployeeIds((current) => {
                        const next = new Set(current);
                        if (next.has(employeeId)) next.delete(employeeId);
                        else next.add(employeeId);
                        return next;
                      })}
                      className="h-3.5 w-3.5 rounded border-border accent-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    />
                  </td>
                  <td className="px-3 py-1">
                    <Link
                      to={`/employees/${emp.id}`}
                      className="group flex min-w-0 items-center gap-2"
                    >
                      <EmployeeAvatar
                        userId={emp.id}
                        hasPhoto={!!emp.photo_path}
                        hasBiometricFace={!!emp.has_biometric_face}
                        firstName={emp.first_name}
                        lastName={emp.last_name}
                        size="xs"
                        className="!h-[26px] !w-[26px]"
                      />
                      <span className="truncate text-[11px] font-semibold text-slate-800 group-hover:text-brand-600 dark:text-slate-100">
                        {employeeName}
                      </span>
                    </Link>
                  </td>
                  <td className="truncate px-3 py-1 text-[11px] text-slate-600 dark:text-slate-300" title={emp.email || ""}>{emp.email || "-"}</td>
                  <td className="truncate px-3 py-1 text-[11px] text-slate-600 dark:text-slate-300" title={emp.department_name || ""}>
                    {emp.department_name || "-"}
                  </td>
                  <td className="truncate px-3 py-1 text-[11px] text-slate-600 dark:text-slate-300" title={emp.designation || ""}>
                    {emp.designation || "-"}
                  </td>
                  <td className="px-3 py-1">
                    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" title={employeeLocation}>
                      <MapPin aria-hidden="true" className="h-3 w-3 shrink-0" />
                      <span className="truncate">{employeeLocation}</span>
                    </span>
                  </td>
                  <td className="px-3 py-1 text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                    {emp.emp_code || "-"}
                  </td>
                  <td className="px-3 py-1">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        emp.status === 1
                          ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                          : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                      }`}
                    >
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${emp.status === 1 ? "bg-emerald-500" : "bg-red-500"}`} />
                      {emp.status === 1 ? tx("statusActive") : tx("statusInactive")}
                    </span>
                  </td>
                  <td className="px-3 py-1">
                    <div className="relative flex items-center justify-end gap-0.5">
                      <Link
                        to={`/employees/${emp.id}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-brand-50 hover:text-brand-600 dark:text-slate-400 dark:hover:bg-brand-950/40"
                        title={tx("viewProfile") as string}
                        aria-label={tx("viewEmployeeAria", { name: employeeName }) as string}
                      >
                        <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                      </Link>
                      {canEditAll && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditTargetId(emp.id);
                            setEditError(null);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-brand-50 hover:text-brand-600 dark:text-slate-400 dark:hover:bg-brand-950/40"
                          title={tx("editTooltip") as string}
                          aria-label={tx("editAria", { name: `${emp.first_name} ${emp.last_name}` }) as string}
                        >
                          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpenTableMenuId((current) => current === employeeId ? null : employeeId)}
                        aria-haspopup="menu"
                        aria-expanded={openTableMenuId === employeeId}
                        aria-label={tx("moreActionsAria", { name: employeeName }) as string}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-muted hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        <MoreVertical aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                      {openTableMenuId === employeeId && (
                        <div role="menu" className="absolute right-0 top-8 z-30 min-w-40 rounded-lg border border-border bg-card p-1 text-left shadow-lg">
                          {canInvite && emp.id !== currentUser?.id && emp.status === 1 && emp.email && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                if (invitingId !== null) return;
                                setInvitingId(emp.id);
                                setOpenTableMenuId(null);
                                sendDirectInvite.mutate(emp.id);
                              }}
                              disabled={invitingId !== null}
                              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-50"
                            >
                              {invitingId === emp.id ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Send aria-hidden="true" className="h-3.5 w-3.5" />}
                              {tx("sendInvitation")}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenTableMenuId(null);
                                setDeleteTarget({ id: emp.id, name: employeeName });
                              }}
                              disabled={emp.id === currentUser?.id}
                              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/40"
                            >
                              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                              {tx("deleteEmployee")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy={isLoading}>
            {isLoading ? (
              Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="h-[210px] animate-pulse rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="flex gap-2.5">
                    <div className="h-10 w-10 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-28 rounded bg-muted" />
                      <div className="h-3 w-40 rounded bg-muted" />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {Array.from({ length: 5 }, (_, row) => <div key={row} className="h-3 rounded bg-muted" />)}
                  </div>
                </div>
              ))
            ) : employees.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-border bg-card px-4 py-14 text-center text-sm text-muted-foreground">
                {tx("noEmployees")}
              </div>
            ) : (
              employees.map((employee: any) => (
                <article key={employee.id} className="group relative flex min-h-[210px] min-w-0 flex-col overflow-visible rounded-xl border border-border bg-card shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md">
                  <div className="flex items-start gap-2.5 p-3 pb-2">
                    <EmployeeAvatar
                      userId={employee.id}
                      hasPhoto={!!employee.photo_path}
                      hasBiometricFace={!!employee.has_biometric_face}
                      firstName={employee.first_name}
                      lastName={employee.last_name}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2 pr-7">
                        <Link to={`/employees/${employee.id}`} className="truncate text-xs font-bold text-slate-800 transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-100">
                          {employee.first_name} {employee.last_name}
                        </Link>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${employee.status === 1 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"}`}>
                          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${employee.status === 1 ? "bg-emerald-500" : "bg-rose-500"}`} />
                          {employee.status === 1 ? tx("statusActive") : tx("statusInactive")}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400" title={employee.email}>{employee.email}</p>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setOpenCardMenu((current) => current?.id === employee.id && current?.anchor === "header" ? null : { id: employee.id, anchor: "header" })}
                        aria-haspopup="menu"
                        aria-expanded={openCardMenu?.id === employee.id && openCardMenu?.anchor === "header"}
                        aria-label={`More actions for ${employee.first_name} ${employee.last_name}`}
                        className="absolute right-2 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-muted hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        <MoreVertical aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {canDelete && openCardMenu?.id === employee.id && (
                    <div
                      role="menu"
                      className={`absolute right-3 z-20 min-w-36 rounded-lg border border-border bg-card p-1 shadow-lg ${openCardMenu?.anchor === "header" ? "top-11" : "bottom-10"}`}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpenCardMenu(null);
                          setDeleteTarget({ id: employee.id, name: `${employee.first_name} ${employee.last_name}` });
                        }}
                        disabled={employee.id === currentUser?.id}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        {employee.id === currentUser?.id ? tx("deleteSelfTooltip") : tx("deleteTooltip")}
                      </button>
                    </div>
                  )}

                  <dl className="flex-1 space-y-1 px-3 pb-2.5 text-[11px] leading-4">
                    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
                      <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Building2 aria-hidden="true" className="h-3 w-3" />{t("common.department")}</dt>
                      <dd className="truncate font-medium text-slate-800 dark:text-slate-100" title={employee.department_name || "-"}>{employee.department_name || "-"}</dd>
                    </div>
                    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
                      <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Briefcase aria-hidden="true" className="h-3 w-3" />{tx("colDesignation")}</dt>
                      <dd className="truncate font-medium text-slate-800 dark:text-slate-100" title={employee.designation || "-"}>{employee.designation || "-"}</dd>
                    </div>
                    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
                      <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><MapPin aria-hidden="true" className="h-3 w-3" />{tx("location")}</dt>
                      <dd className="truncate font-medium text-slate-800 dark:text-slate-100">{locationById.get(String(employee.location_id)) || "-"}</dd>
                    </div>
                    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
                      <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><IdCard aria-hidden="true" className="h-3 w-3" />{tx("employeeId")}</dt>
                      <dd className="truncate font-medium tabular-nums text-slate-800 dark:text-slate-100">{employee.emp_code || "-"}</dd>
                    </div>
                    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2">
                      <dt className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Users aria-hidden="true" className="h-3 w-3" />{tx("colRole")}</dt>
                      <dd className="truncate font-medium capitalize text-slate-800 dark:text-slate-100">{roleLabel(employee.role || "employee")}</dd>
                    </div>
                  </dl>

                  <div className="relative flex min-h-9 items-center justify-end gap-1 border-t border-border px-3">
                    {canInvite && employee.id !== currentUser?.id && employee.status === 1 && employee.email && (
                      <button
                        type="button"
                        onClick={() => {
                          if (invitingId !== null) return;
                          setInvitingId(employee.id);
                          sendDirectInvite.mutate(employee.id);
                        }}
                        disabled={invitingId !== null}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-blue-950/40"
                        title={tx("sendInviteTooltip", { email: employee.email }) as string}
                        aria-label={tx("sendInviteAria", { name: `${employee.first_name} ${employee.last_name}` }) as string}
                      >
                        {invitingId === employee.id ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Send aria-hidden="true" className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {canEditAll && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditTargetId(employee.id);
                          setEditError(null);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-400 dark:hover:bg-brand-950/40"
                        title={tx("editTooltip") as string}
                        aria-label={tx("editAria", { name: `${employee.first_name} ${employee.last_name}` }) as string}
                      >
                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setOpenCardMenu((current) => current?.id === employee.id && current?.anchor === "footer" ? null : { id: employee.id, anchor: "footer" })}
                        aria-haspopup="menu"
                        aria-expanded={openCardMenu?.id === employee.id && openCardMenu?.anchor === "footer"}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-muted hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-400 dark:hover:text-slate-100"
                        aria-label={`More actions for ${employee.first_name} ${employee.last_name}`}
                      >
                        <MoreVertical aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        )}

        {/* Edit Employee Modal */}
        {editTargetId !== null && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => {
                if (updateEmployee.isPending || resetPassword.isPending) return;
                setEditTargetId(null);
                setShowPasswordSection(false);
                setNewPassword("");
                setConfirmPassword("");
                setPasswordError(null);
                setPasswordCopied(false);
                resetPassword.reset();
              }}
          >
            <div
              className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Edit Employee</h3>
                  <p className="text-xs text-muted-foreground">
                    {editLoading ? "Loading..." : editEmployee ? `${editEmployee.first_name} ${editEmployee.last_name} — ${editEmployee.email}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                if (updateEmployee.isPending || resetPassword.isPending) return;
                setEditTargetId(null);
                setShowPasswordSection(false);
                setNewPassword("");
                setConfirmPassword("");
                setPasswordError(null);
                setPasswordCopied(false);
                resetPassword.reset();
              }}
                  className="text-muted-foreground hover:text-muted-foreground"
                  aria-label={t("common.close")}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {editLoading || !editEmployee ? (
                <div className="flex justify-center items-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <form
                  key={editEmployee.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    setEditError(null);
                    const fd = new FormData(e.currentTarget);
                    const row: any = { id: editEmployee.id };
                    for (const [key, value] of fd.entries()) {
                      row[key] = typeof value === "string" ? value : "";
                    }
                    updateEmployee.mutate(row);
                  }}
                  className="flex flex-col overflow-hidden"
                >
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Emp Code</label>
                        <input name="emp_code" defaultValue={editEmployee.emp_code || ""} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Contact</label>
                        <input name="contact_number" defaultValue={editEmployee.contact_number || ""} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">First Name <span className="text-red-500">*</span></label>
                        <input name="first_name" defaultValue={editEmployee.first_name || ""} required className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Last Name <span className="text-red-500">*</span></label>
                        <input name="last_name" defaultValue={editEmployee.last_name || ""} required className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-muted-foreground mb-1">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          name="email"
                          defaultValue={editEmployee.email || ""}
                          required
                          className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                        />
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                          Email is the user's login. Changing it ends their current session and notifies both the old and new addresses.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Designation</label>
                        <input name="designation" defaultValue={editEmployee.designation || ""} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Department</label>
                        <select
                          name="department_name"
                          defaultValue={deptList.find((d: any) => d.id === editEmployee.department_id)?.name || ""}
                          className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                        >
                          <option value="">—</option>
                          {deptList.map((d: any) => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Location</label>
                        <select
                          name="location_name"
                          defaultValue={(locations || []).find((l: any) => l.id === editEmployee.location_id)?.name || ""}
                          className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                        >
                          <option value="">—</option>
                          {(locations || []).map((l: any) => (
                            <option key={l.id} value={l.name}>{l.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Employment Type</label>
                        <select name="employment_type" defaultValue={editEmployee.employment_type || "full_time"} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none">
                          <option value="full_time">Full Time</option>
                          <option value="part_time">Part Time</option>
                          <option value="contract">Contract</option>
                          <option value="intern">Intern</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Gender</label>
                        <select name="gender" defaultValue={editEmployee.gender || ""} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none">
                          <option value="">—</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Date of Birth</label>
                        <input type="date" name="date_of_birth" defaultValue={formatDate(editEmployee.date_of_birth)} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Date of Joining</label>
                        <input type="date" name="date_of_joining" defaultValue={formatDate(editEmployee.date_of_joining)} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Role</label>
                        <select name="role" defaultValue={editEmployee.role || "employee"} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none">
                          <option value="employee">Employee</option>
                          <option value="manager">Manager</option>
                          <option value="hr_admin">HR Admin</option>
                          <option value="org_admin">Org Admin</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Address</label>
                        <textarea name="address" defaultValue={editEmployee.address || ""} rows={2} className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none" />
                      </div>
                      {/* Custom Roles — additive on top of the primary system role above.
                          Saves immediately on add/remove (independent of the form's
                          Save Changes button) since it hits a different endpoint. */}
                      <div className="sm:col-span-2">
                        <CustomRolesField
                          userId={editEmployee.id}
                          canEdit={isOrgAdmin}
                          compact
                        />
                      </div>
                    </div>
                    {editError && (
                      <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300">{editError}</div>
                    )}

                    {/* Password reset — org_admin only, not for own row */}
                    {isOrgAdmin && editEmployee.id !== currentUser?.id && (
                      <div className="mt-6 border-t border-border pt-5">
                        {!showPasswordSection ? (
                          <button
                            type="button"
                            onClick={() => setShowPasswordSection(true)}
                            className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700"
                          >
                            <KeyRound className="h-4 w-4" />
                            Change password
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <KeyRound className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                                Change password
                              </h4>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowPasswordSection(false);
                                  setNewPassword("");
                                  setConfirmPassword("");
                                  setPasswordError(null);
                                }}
                                className="text-xs text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Set a new password for this employee. They will need to use the new
                              password on their next sign-in. Share it with them securely.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">
                                  New Password
                                </label>
                                <div className="relative">
                                  <input
                                    type={showNewPassword ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => {
                                      setNewPassword(e.target.value);
                                      if (passwordError) setPasswordError(null);
                                    }}
                                    placeholder="Min 8 chars, upper, lower, digit, special"
                                    className="w-full px-3 py-2 pr-9 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                    autoComplete="new-password"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowNewPassword((v) => !v)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-2 text-muted-foreground hover:text-muted-foreground"
                                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                                  >
                                    {showNewPassword ? (
                                      <EyeOff className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-muted-foreground mb-1">
                                  Confirm Password
                                </label>
                                <input
                                  type={showNewPassword ? "text" : "password"}
                                  value={confirmPassword}
                                  onChange={(e) => {
                                    setConfirmPassword(e.target.value);
                                    if (passwordError) setPasswordError(null);
                                  }}
                                  placeholder="Re-enter password"
                                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                  autoComplete="new-password"
                                />
                              </div>
                            </div>
                            {passwordError && (
                              <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={resetPassword.isPending}
                                onClick={() => {
                                  setPasswordError(null);
                                  if (!newPassword || !confirmPassword) {
                                    setPasswordError("Both password fields are required");
                                    return;
                                  }
                                  if (newPassword !== confirmPassword) {
                                    setPasswordError("Passwords do not match");
                                    return;
                                  }
                                  if (newPassword.length < 8) {
                                    setPasswordError("Password must be at least 8 characters");
                                    return;
                                  }
                                  if (
                                    !/[A-Z]/.test(newPassword) ||
                                    !/[a-z]/.test(newPassword) ||
                                    !/[0-9]/.test(newPassword) ||
                                    !/[^A-Za-z0-9]/.test(newPassword)
                                  ) {
                                    setPasswordError(
                                      "Password must include uppercase, lowercase, digit, and special character",
                                    );
                                    return;
                                  }
                                  resetPassword.mutate(
                                    { userId: editEmployee.id, password: newPassword },
                                    {
                                      onSuccess: () => {
                                        try {
                                          navigator.clipboard.writeText(newPassword);
                                          setPasswordCopied(true);
                                          setTimeout(() => setPasswordCopied(false), 2000);
                                        } catch {
                                          // clipboard may fail on http; ignore
                                        }
                                      },
                                    },
                                  );
                                }}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                              >
                                {resetPassword.isPending ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                                  </>
                                ) : (
                                  <>
                                    <KeyRound className="h-4 w-4" /> Reset Password
                                  </>
                                )}
                              </button>
                              {resetPassword.isSuccess && !passwordError && (
                                <span className="inline-flex items-center gap-1.5 text-sm text-green-700 dark:text-green-300">
                                  <CheckCircle2 className="h-4 w-4" />
                                  {passwordCopied
                                    ? "Password reset and copied to clipboard"
                                    : "Password reset — share securely"}
                                  {passwordCopied && <Copy className="h-3.5 w-3.5" />}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted rounded-b-2xl">
                    <button
                      type="button"
                      onClick={() => {
                if (updateEmployee.isPending || resetPassword.isPending) return;
                setEditTargetId(null);
                setShowPasswordSection(false);
                setNewPassword("");
                setConfirmPassword("");
                setPasswordError(null);
                setPasswordCopied(false);
                resetPassword.reset();
              }}
                      disabled={updateEmployee.isPending}
                      className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-card disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={updateEmployee.isPending}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                    >
                      {updateEmployee.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !deleteEmployee.isPending && setDeleteTarget(null)}
          >
            <div
              className="bg-card rounded-xl shadow-xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5 border-b border-border">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Delete employee</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Deactivate <span className="font-medium text-muted-foreground">{deleteTarget.name}</span>? This will revoke their access immediately. You can reactivate them later from user management.
                    </p>
                  </div>
                </div>
              </div>
              {deleteEmployee.isError && (
                <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300">
                  {(deleteEmployee.error as any)?.response?.data?.error?.message || "Failed to delete employee"}
                </div>
              )}
              <div className="px-6 py-4 bg-muted rounded-b-xl flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteEmployee.isPending}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-card disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteEmployee.mutate(deleteTarget.id)}
                  disabled={deleteEmployee.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteEmployee.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
                    </>
                  ) : (
                    "Delete"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pagination */}
        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Page {meta.page} of {meta.total_pages} ({meta.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50 hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50 hover:bg-muted"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={cancelInviteTarget !== null}
        title={cancelInviteTarget ? `Cancel the invitation to ${cancelInviteTarget.email}?` : "Cancel invitation?"}
        description="If they haven't set a password yet, their account will also be removed from the directory. Active accounts are left alone."
        confirmText="Cancel invitation"
        cancelText="Keep invitation"
        variant="danger"
        loading={cancelInvitation.isPending}
        onConfirm={() => cancelInviteTarget && cancelInvitation.mutate(cancelInviteTarget.id)}
        onCancel={() => setCancelInviteTarget(null)}
      />
    </div>
  );
}
