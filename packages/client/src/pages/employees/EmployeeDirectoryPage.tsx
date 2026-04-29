import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, Download, Upload, X, CheckCircle2, AlertTriangle, Loader2, Pencil, Trash2, UserPlus, Mail, FileSpreadsheet, KeyRound, Eye, EyeOff, Copy, Send, Users } from "lucide-react";
import api from "@/api/client";
import { useDepartments, useInviteUser } from "@/api/hooks";
import { useAuthStore } from "@/lib/auth-store";
import CsvImportUsersModal from "@/components/CsvImportUsersModal";
import { showToast } from "@/components/ui/Toast";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
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
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isOrgAdmin = currentUser?.role === "org_admin" || currentUser?.role === "super_admin";
  const canDelete = isOrgAdmin;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
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

  // Pending invitations panel — only fetched for org_admin.
  const { data: pendingInvitations } = useQuery({
    queryKey: ["pending-invitations"],
    queryFn: () =>
      api
        .get("/users/invitations", { params: { status: "pending" } })
        .then((r) => r.data.data)
        .catch(() => [] as any[]),
    enabled: isOrgAdmin,
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

  // Inline role update — only org_admin sees the dropdown editor.
  const updateRoleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api.put(`/users/${userId}`, { role }).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-directory"] }),
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
      },
    ],
    queryFn: () =>
      api
        .get("/employees/directory", {
          params: {
            page,
            per_page: 20,
            ...(search ? { search } : {}),
            ...(departmentId ? { department_id: departmentId } : {}),
            ...(locationId ? { location_id: locationId } : {}),
            ...(roleFilter ? { role: roleFilter } : {}),
          },
        })
        .then((r) => r.data),
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

  const employees = data?.data || [];
  const meta = data?.meta;
  const deptList = departments || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Directory</h1>
          <p className="text-gray-500 mt-1">Browse and search your organization's employees.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={exportQuery.isFetching}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exportQuery.isFetching ? "Exporting..." : "Export Excel"}
          </button>
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
            <Upload className="h-4 w-4" />
            Bulk Update
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          {isOrgAdmin && (
            <button
              onClick={() => setShowPendingInvitations(true)}
              className={`relative flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
                invitations.length > 0
                  ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Mail className="h-4 w-4" />
              Pending Invitations
              {invitations.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-600 text-white text-xs font-semibold">
                  {invitations.length}
                </span>
              )}
            </button>
          )}
          {isOrgAdmin && (
            <button
              onClick={() => setShowCsvImport(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <FileSpreadsheet className="h-4 w-4" /> Import Employees
            </button>
          )}
          {isOrgAdmin && (
            <button
              onClick={() => setShowBulkInviteConfirm(true)}
              disabled={bulkInvite.isPending}
              title="Send invitations to every employee who hasn't set a password yet"
              className="flex items-center gap-2 px-4 py-2 border border-brand-300 bg-brand-50 text-brand-800 rounded-lg text-sm font-medium hover:bg-brand-100 disabled:opacity-50"
            >
              <Users className="h-4 w-4" /> Invite All
            </button>
          )}
          {isOrgAdmin && (
            <button
              onClick={() => setShowInvite((v) => !v)}
              className="flex items-center gap-2 bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700 shadow-sm transition-all"
            >
              <UserPlus className="h-4 w-4" /> Invite Employee
            </button>
          )}
        </div>
      </div>

      {/* Bulk-invite confirmation. Server enforces seat limits and skips
           anyone with a pending invite, but a friendly heads-up is still
           the right UX before firing N emails. */}
      {isOrgAdmin && showBulkInviteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !bulkInvite.isPending && setShowBulkInviteConfirm(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-700">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {bulkInviteIncludeActivated
                    ? "Invite all employees"
                    : "Invite all unactivated employees"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {bulkInviteIncludeActivated
                    ? "This sends a fresh invitation email to every active employee in the directory — including users who have already set a password. When they click the link, their existing password will be overwritten with the new one they pick."
                    : "This sends an invitation email to every active employee in the directory who hasn't set a password yet. Anyone with a pending invitation is skipped."}
                </p>
              </div>
            </div>

            {/* Opt-in to also re-invite already-activated users (bulk
                password reset). Off by default to prevent accidental
                mass-resets. */}
            <label className="mt-2 mb-2 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 cursor-pointer hover:bg-gray-100">
              <input
                type="checkbox"
                checked={bulkInviteIncludeActivated}
                onChange={(e) => setBulkInviteIncludeActivated(e.target.checked)}
                disabled={bulkInvite.isPending}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <div className="text-xs text-gray-700">
                <span className="font-medium">Also re-invite already-activated employees</span>
                <p className="text-gray-500 mt-0.5">
                  Existing users will receive a fresh link. Clicking it resets their current password.
                </p>
              </div>
            </label>

            {bulkInviteIncludeActivated && (
              <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <strong>Heads-up:</strong> every active employee will receive a fresh invitation email.
                Their current password will be overwritten when they click the link.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkInviteConfirm(false)}
                disabled={bulkInvite.isPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
      {showInvite && isOrgAdmin && (
        <form
          onSubmit={handleInvite}
          className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="colleague@company.com"
                required
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                value={inviteFirstName}
                onChange={(e) => setInviteFirstName(e.target.value)}
                disabled={!!existingUserMatch}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                placeholder="Jane"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                value={inviteLastName}
                onChange={(e) => setInviteLastName(e.target.value)}
                disabled={!!existingUserMatch}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                placeholder="Doe"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                disabled={!!existingUserMatch}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
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
            <p className="text-xs text-gray-500">
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
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
        </form>
      )}

      {/* Pending Invitations modal — opened via the action-bar button so the
          directory page stays uncluttered when many invitations are queued. */}
      {isOrgAdmin && showPendingInvitations && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowPendingInvitations(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Pending Invitations
                  </h3>
                  <p className="text-xs text-gray-500">
                    {invitations.length} invitation{invitations.length === 1 ? "" : "s"} waiting to be accepted
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPendingInvitations(false)}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {invitations.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">
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
                        <div className="h-8 w-8 flex-shrink-0 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                          <Mail className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {inv.email}
                          </p>
                          <p className="text-xs text-gray-500 capitalize">
                            {(inv.role || "employee").replace(/_/g, " ")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
                          Pending
                        </span>
                        <span className="text-xs text-gray-400">
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
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
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
                          onClick={() => {
                            const ok = window.confirm(
                              `Cancel the invitation to ${inv.email}?\n\n` +
                                "If they haven't set a password yet, their account will also be removed from the directory. Active accounts are left alone.",
                            );
                            if (ok) cancelInvitation.mutate(inv.id);
                          }}
                          disabled={
                            cancelInvitation.isPending && cancelInvitation.variables === inv.id
                          }
                          title="Cancel this invitation and remove the unactivated user"
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
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

            <div className="flex justify-end gap-2 px-6 py-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowPendingInvitations(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Bulk Update Preview</h3>
                <p className="text-xs text-gray-400">{uploadRows.length} rows parsed from file</p>
              </div>
              <button onClick={() => { setShowUpload(false); setUploadRows([]); setUploadResult(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Result Banner */}
            {uploadResult && (
              <div className={`mx-6 mt-4 p-3 rounded-lg text-sm ${uploadResult.errors > 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800"}`}>
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
                          className="sticky top-0 z-10 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase px-3 py-2 border-b border-gray-200"
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
                      <tr key={i} className={detail?.status === "error" ? "bg-red-50" : ""}>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap border-b border-gray-100">{row.id || "-"}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap border-b border-gray-100">{row.emp_code || "-"}</td>
                        <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap border-b border-gray-100">{row.first_name} {row.last_name}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap border-b border-gray-100">{row.email || "-"}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap border-b border-gray-100">{row.designation || "-"}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap border-b border-gray-100">{row.department_name || "-"}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap border-b border-gray-100">{row.role || "-"}</td>
                        {uploadResult && (
                          <td className="px-3 py-2 whitespace-nowrap border-b border-gray-100">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              detail?.status === "updated" ? "bg-green-100 text-green-700"
                                : detail?.status === "unchanged" ? "bg-gray-100 text-gray-500"
                                : detail?.status === "error" ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
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
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <p className="text-xs text-gray-400">
                Edit the exported CSV, change values, and upload. The ID column identifies each employee.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowUpload(false); setUploadRows([]); setUploadResult(null); }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100"
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
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            placeholder="Search by name, email, designation, or department..."
          />
        </div>
        <select
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        >
          <option value="">All Departments</option>
          {deptList.map((d: any) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={locationId}
          onChange={(e) => {
            setLocationId(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        >
          <option value="">All Locations</option>
          {(locations || []).map((l: any) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        >
          <option value="">All Roles</option>
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
          <option value="hr_admin">HR Admin</option>
          <option value="org_admin">Org Admin</option>
        </select>
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
      <div className="bg-white rounded-none lg:rounded-xl border-y border-gray-200 lg:border lg:border-gray-200 overflow-x-auto overscroll-x-contain -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Email</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Department</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Designation</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Role</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Emp Code</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gray-200" />
                        <div className="h-4 w-28 bg-gray-200 rounded" />
                      </div>
                    </td>
                    <td className="px-6 py-4"><div className="h-4 w-36 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-14 bg-gray-200 rounded-full" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded ml-auto" /></td>
                  </tr>
                ))}
              </>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-400">
                  No employees found
                </td>
              </tr>
            ) : (
              employees.map((emp: any) => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link
                      to={`/employees/${emp.id}`}
                      className="flex items-center gap-3 group"
                    >
                      <EmployeeAvatar
                        userId={emp.id}
                        hasPhoto={!!emp.photo_path}
                        firstName={emp.first_name}
                        lastName={emp.last_name}
                        size="sm"
                      />
                      <span className="text-sm font-medium text-gray-900 group-hover:text-brand-600">
                        {emp.first_name} {emp.last_name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{emp.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {emp.department_name || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {emp.designation || "-"}
                  </td>
                  <td className="px-6 py-4">
                    {isOrgAdmin && emp.id !== currentUser?.id ? (
                      <select
                        value={emp.role || "employee"}
                        onChange={(e) =>
                          updateRoleMut.mutate({ userId: emp.id, role: e.target.value })
                        }
                        disabled={updateRoleMut.isPending}
                        className="text-xs border border-gray-200 rounded-full px-2 py-1 bg-gray-50 text-gray-700 capitalize cursor-pointer hover:bg-gray-100 disabled:opacity-50"
                      >
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        <option value="hr_admin">HR Admin</option>
                        <option value="org_admin">Org Admin</option>
                      </select>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full capitalize">
                        {(emp.role || "employee").replace(/_/g, " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {emp.emp_code || "-"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        emp.status === 1
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {emp.status === 1 ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {/* Per-row Invite — sends an invitation to this employee's
                          email/role without opening the bulk invite modal.
                          Hidden for the current user (no self-invites) and
                          inactive accounts (status != 1) so HR doesn't bounce
                          mail to disabled mailboxes; disabled while an invite
                          for this row is in flight. */}
                      {emp.id !== currentUser?.id && emp.status === 1 && emp.email && (
                        <button
                          type="button"
                          onClick={() => {
                            if (invitingId !== null) return;
                            setInvitingId(emp.id);
                            sendDirectInvite.mutate(emp.id);
                          }}
                          disabled={invitingId !== null}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-wait"
                          title={`Send invitation to ${emp.email}`}
                          aria-label={`Send invitation to ${emp.first_name} ${emp.last_name}`}
                        >
                          {invitingId === emp.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditTargetId(emp.id);
                          setEditError(null);
                        }}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-500 hover:bg-brand-50 hover:text-brand-600 transition-colors"
                        title="Edit employee"
                        aria-label={`Edit ${emp.first_name} ${emp.last_name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({ id: emp.id, name: `${emp.first_name} ${emp.last_name}` })
                          }
                          disabled={emp.id === currentUser?.id}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500"
                          title={emp.id === currentUser?.id ? "You cannot delete your own account" : "Delete employee"}
                          aria-label={`Delete ${emp.first_name} ${emp.last_name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

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
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Edit Employee</h3>
                  <p className="text-xs text-gray-400">
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
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {editLoading || !editEmployee ? (
                <div className="flex justify-center items-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Emp Code</label>
                        <input name="emp_code" defaultValue={editEmployee.emp_code || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
                        <input name="contact_number" defaultValue={editEmployee.contact_number || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">First Name <span className="text-red-500">*</span></label>
                        <input name="first_name" defaultValue={editEmployee.first_name || ""} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Last Name <span className="text-red-500">*</span></label>
                        <input name="last_name" defaultValue={editEmployee.last_name || ""} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" defaultValue={editEmployee.email || ""} disabled className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500" />
                        <p className="text-xs text-gray-400 mt-1">Email cannot be changed from this screen.</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                        <input name="designation" defaultValue={editEmployee.designation || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                        <select
                          name="department_name"
                          defaultValue={deptList.find((d: any) => d.id === editEmployee.department_id)?.name || ""}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                        >
                          <option value="">—</option>
                          {deptList.map((d: any) => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                        <select
                          name="location_name"
                          defaultValue={(locations || []).find((l: any) => l.id === editEmployee.location_id)?.name || ""}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                        >
                          <option value="">—</option>
                          {(locations || []).map((l: any) => (
                            <option key={l.id} value={l.name}>{l.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                        <select name="employment_type" defaultValue={editEmployee.employment_type || "full_time"} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none">
                          <option value="full_time">Full Time</option>
                          <option value="part_time">Part Time</option>
                          <option value="contract">Contract</option>
                          <option value="intern">Intern</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                        <select name="gender" defaultValue={editEmployee.gender || ""} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none">
                          <option value="">—</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                        <input type="date" name="date_of_birth" defaultValue={formatDate(editEmployee.date_of_birth)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date of Joining</label>
                        <input type="date" name="date_of_joining" defaultValue={formatDate(editEmployee.date_of_joining)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                        <select name="role" defaultValue={editEmployee.role || "employee"} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none">
                          <option value="employee">Employee</option>
                          <option value="manager">Manager</option>
                          <option value="hr_admin">HR Admin</option>
                          <option value="org_admin">Org Admin</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                        <textarea name="address" defaultValue={editEmployee.address || ""} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none" />
                      </div>
                    </div>
                    {editError && (
                      <div className="mt-4 p-3 rounded-lg bg-red-50 text-sm text-red-700">{editError}</div>
                    )}

                    {/* Password reset — org_admin only, not for own row */}
                    {isOrgAdmin && editEmployee.id !== currentUser?.id && (
                      <div className="mt-6 border-t border-gray-100 pt-5">
                        {!showPasswordSection ? (
                          <button
                            type="button"
                            onClick={() => setShowPasswordSection(true)}
                            className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
                          >
                            <KeyRound className="h-4 w-4" />
                            Change password
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                <KeyRound className="h-4 w-4 text-brand-600" />
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
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                            <p className="text-xs text-gray-500">
                              Set a new password for this employee. They will need to use the new
                              password on their next sign-in. Share it with them securely.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                                    className="w-full px-3 py-2 pr-9 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                    autoComplete="new-password"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowNewPassword((v) => !v)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-400 hover:text-gray-600"
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                  autoComplete="new-password"
                                />
                              </div>
                            </div>
                            {passwordError && (
                              <p className="text-sm text-red-600">{passwordError}</p>
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
                                <span className="inline-flex items-center gap-1.5 text-sm text-green-700">
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
                  <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
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
                      className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50"
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
              className="bg-white rounded-xl shadow-xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Delete employee</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Deactivate <span className="font-medium text-gray-700">{deleteTarget.name}</span>? This will revoke their access immediately. You can reactivate them later from user management.
                    </p>
                  </div>
                </div>
              </div>
              {deleteEmployee.isError && (
                <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 text-sm text-red-700">
                  {(deleteEmployee.error as any)?.response?.data?.error?.message || "Failed to delete employee"}
                </div>
              )}
              <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteEmployee.isPending}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50"
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
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Page {meta.page} of {meta.total_pages} ({meta.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
