import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, Download, Upload, X, CheckCircle2, AlertTriangle, Loader2, Pencil, Trash2, UserPlus, Mail } from "lucide-react";
import api from "@/api/client";
import { useDepartments, useInviteUser } from "@/api/hooks";
import { useAuthStore } from "@/lib/auth-store";
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
  const [inviteError, setInviteError] = useState("");
  const inviteUser = useInviteUser();

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

  // Inline role update — only org_admin sees the dropdown editor.
  const updateRoleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api.put(`/users/${userId}`, { role }).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-directory"] }),
  });

  const fileRef = useRef<HTMLInputElement>(null);

  const { data: departments } = useDepartments();

  const { data: locations } = useQuery({
    queryKey: ["org-locations"],
    queryFn: () => api.get("/organizations/me/locations").then((r) => r.data.data),
    staleTime: 60000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["employee-directory", { page, search: search || undefined, department_id: departmentId || undefined }],
    queryFn: () =>
      api
        .get("/employees/directory", {
          params: {
            page,
            per_page: 20,
            ...(search ? { search } : {}),
            ...(departmentId ? { department_id: departmentId } : {}),
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
      await inviteUser.mutateAsync({ email: inviteEmail, role: inviteRole as any });
      setInviteEmail("");
      setInviteRole("employee");
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
              onClick={() => setShowInvite((v) => !v)}
              className="flex items-center gap-2 bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-brand-700 shadow-sm transition-all"
            >
              <UserPlus className="h-4 w-4" /> Invite Employee
            </button>
          )}
        </div>
      </div>

      {/* Invite form (absorbed from the retired Users page) */}
      {showInvite && isOrgAdmin && (
        <form
          onSubmit={handleInvite}
          className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-3"
        >
          <div className="flex items-end gap-4">
            <div className="flex-1">
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="hr_admin">HR Admin</option>
                <option value="org_admin">Org Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviteUser.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              {inviteUser.isPending ? "Sending..." : "Send Invite"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowInvite(false);
                setInviteError("");
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
        </form>
      )}

      {/* Pending Invitations panel — only when there is at least one. */}
      {isOrgAdmin && invitations.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">
            Pending Invitations ({invitations.length})
          </h3>
          <div className="space-y-2">
            {invitations.map((inv: any) => (
              <div
                key={inv.id}
                className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-amber-100"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-900">{inv.email}</span>
                    <span className="text-xs text-gray-500 ml-2 capitalize">
                      {(inv.role || "employee").replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
                    Pending
                  </span>
                  <span className="text-xs text-gray-400">
                    Invited{" "}
                    {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
              </div>
            ))}
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
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
                      <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">
                        {emp.first_name?.[0]}
                        {emp.last_name?.[0]}
                      </div>
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
            onClick={() => !updateEmployee.isPending && setEditTargetId(null)}
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
                  onClick={() => !updateEmployee.isPending && setEditTargetId(null)}
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
                  </div>
                  <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                    <button
                      type="button"
                      onClick={() => !updateEmployee.isPending && setEditTargetId(null)}
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
