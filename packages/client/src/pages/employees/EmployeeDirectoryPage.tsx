import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Users, ChevronLeft, ChevronRight, Download, Upload, X, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import api from "@/api/client";
import { useDepartments } from "@/api/hooks";
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

// Keep CSV parser as fallback
function parseCsvUpload(text: string): any[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.match(/("([^"]|"")*"|[^,]*)/g) || [];
    const row: any = {};
    headers.forEach((h, i) => {
      let v = (values[i] || "").trim().replace(/^"|"$/g, "").replace(/""/g, '"');
      row[h] = v;
    });
    if (row.id) row.id = Number(row.id);
    return row;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmployeeDirectoryPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadRows, setUploadRows] = useState<any[]>([]);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: departments } = useDepartments();

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
          <label className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 cursor-pointer">
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
        </div>
      </div>

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

            {/* Preview Table */}
            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">ID</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Emp Code</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Name</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Email</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Designation</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Department</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Role</th>
                    {uploadResult && <th className="text-left text-xs font-medium text-gray-500 uppercase px-3 py-2">Status</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {uploadRows.map((row, i) => {
                    const detail = uploadResult?.details?.[i];
                    return (
                      <tr key={i} className={detail?.status === "error" ? "bg-red-50" : ""}>
                        <td className="px-3 py-2 text-gray-500">{row.id || "-"}</td>
                        <td className="px-3 py-2 text-gray-600">{row.emp_code || "-"}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{row.first_name} {row.last_name}</td>
                        <td className="px-3 py-2 text-gray-500">{row.email || "-"}</td>
                        <td className="px-3 py-2 text-gray-500">{row.designation || "-"}</td>
                        <td className="px-3 py-2 text-gray-500">{row.department_name || "-"}</td>
                        <td className="px-3 py-2 text-gray-500">{row.role || "-"}</td>
                        {uploadResult && (
                          <td className="px-3 py-2">
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
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Emp Code</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
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
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-14 bg-gray-200 rounded-full" /></td>
                  </tr>
                ))}
              </>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
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
                </tr>
              ))
            )}
          </tbody>
        </table>

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
