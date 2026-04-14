import { useUsers, useInviteUser, useDepartments } from "@/api/hooks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { UserPlus, Search, Mail, Upload, Download, X, CheckCircle2, XCircle, FileSpreadsheet, AlertTriangle, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Bulk Import — sample template & types
//
// Both .xlsx and .csv uploads work. The server parses them with the same
// xlsx library, so Excel date serials and non-ISO date strings
// (DD/MM/YYYY, "15 Jan 2026", etc.) are handled transparently.
//
// The server is the source of truth for validation. The real preview comes
// from POST /users/import which validates against the DB (unique emails,
// existing departments/locations/managers, seat limit, etc.). Unknown
// departments are auto-created on execute — they are NOT an error.
// ---------------------------------------------------------------------------

// The template includes both first_name/last_name and a full_name column.
// Users can fill in either pair — the server accepts both. full_name is
// split on whitespace: first token → first_name, rest → last_name. So
// "Aishwarya Keshav Murthy Gowda" becomes first="Aishwarya",
// last="Keshav Murthy Gowda".
const TEMPLATE_HEADERS = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "password",
  "role",
  "emp_code",
  "designation",
  "department_name",
  "location_name",
  // Reporting manager can be given as ANY one of these three columns.
  // Priority if multiple are set: email → code → name.
  "reporting_manager_email",
  "reporting_manager_code",
  "reporting_manager_name",
  "employment_type",
  "date_of_joining",
  "date_of_birth",
  "gender",
  "contact_number",
  "address",
];

const TEMPLATE_SAMPLE_ROWS: Array<Record<string, string>> = [
  {
    first_name: "John",
    last_name: "Doe",
    full_name: "",
    email: "john@company.com",
    password: "Welcome@123",
    role: "employee",
    emp_code: "EMP001",
    designation: "Software Engineer",
    department_name: "Engineering",
    location_name: "Bangalore",
    reporting_manager_email: "manager@company.com",
    reporting_manager_code: "",
    reporting_manager_name: "",
    employment_type: "full_time",
    date_of_joining: "2026-01-15",
    date_of_birth: "1995-05-10",
    gender: "male",
    contact_number: "+919876543210",
    address: "12 MG Road, Bangalore",
  },
  {
    // Alternative — use full_name instead of first_name/last_name. This row
    // demonstrates a multi-word name: "Aishwarya Keshav Murthy Gowda" is
    // split into first="Aishwarya", last="Keshav Murthy Gowda".
    first_name: "",
    last_name: "",
    full_name: "Aishwarya Keshav Murthy Gowda",
    email: "aishwarya@company.com",
    password: "",
    role: "manager",
    emp_code: "EMP002",
    designation: "Product Manager",
    department_name: "Product",
    location_name: "Mumbai",
    // Example: looking up manager by employee code
    reporting_manager_email: "",
    reporting_manager_code: "EMP010",
    reporting_manager_name: "",
    employment_type: "full_time",
    date_of_joining: "01/06/2025",
    date_of_birth: "22/11/1990",
    gender: "female",
    contact_number: "+919876543211",
    address: "",
  },
  {
    first_name: "Raj",
    last_name: "Patel",
    full_name: "",
    email: "raj@company.com",
    password: "Welcome@123",
    role: "employee",
    emp_code: "EMP003",
    designation: "Senior Designer",
    department_name: "Design",
    // Unknown location — the server will auto-create "Bhilai"
    location_name: "Bhilai",
    // Example: multiple reporting managers in one cell. Delimiters that
    // work: / \ , ; | &. First resolved value becomes the primary
    // reporting_manager_id; the rest go into user_additional_managers.
    reporting_manager_email: "",
    reporting_manager_code: "",
    reporting_manager_name: "Syamal Ghosh / Sumit Ghosh",
    employment_type: "contract",
    date_of_joining: "2026-03-01",
    date_of_birth: "",
    gender: "",
    contact_number: "+919876543212",
    address: "",
  },
];

/** Row shape after spreadsheet header normalization — matches server ImportRow */
interface CsvRow {
  first_name: string;
  last_name: string;
  full_name?: string;
  email: string;
  password?: string;
  role?: string;
  emp_code?: string;
  designation?: string;
  department_name?: string;
  location_name?: string;
  reporting_manager_email?: string;
  reporting_manager_code?: string;
  reporting_manager_name?: string;
  employment_type?: string;
  date_of_joining?: string;
  date_of_birth?: string;
  date_of_exit?: string;
  gender?: string;
  contact_number?: string;
  address?: string;
}

/** Server validation response — see backend import.service.ts */
interface ServerImportError {
  row: number;
  data: CsvRow;
  errors: string[];
}
interface ServerImportPreview {
  valid: CsvRow[];
  errors: ServerImportError[];
  totalRows: number;
}

// ---------------------------------------------------------------------------
// CSV Import Modal
// ---------------------------------------------------------------------------

function CsvImportModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [preview, setPreview] = useState<ServerImportPreview | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    count: number;
    createdDepartments?: string[];
    createdLocations?: string[];
    skipped?: Array<{ row: number; data?: Record<string, unknown>; errors: string[] }>;
    totalRows?: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setUploadError(null);
    setSelectedFile(file);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post<{ data: ServerImportPreview }>("/users/import", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(res.data.data);
      setStep("preview");
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || "Failed to parse file";
      setUploadError(msg);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const name = file.name.toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLE_ROWS, {
      header: TEMPLATE_HEADERS,
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Users");
    XLSX.writeFile(workbook, "users_import_template.xlsx");
  };

  const validRows = preview?.valid ?? [];
  const invalidRows = preview?.errors ?? [];

  const handleImport = async () => {
    if (!selectedFile) return;
    setStep("importing");
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const res = await api.post<{ data: { count: number; createdDepartments?: string[]; createdLocations?: string[]; skipped?: Array<{ row: number; data?: Record<string, unknown>; errors: string[] }>; totalRows?: number } }>("/users/import/execute", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(res.data.data);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setStep("done");
    } catch (err: any) {
      // Server rejected the batch — probably new errors surfaced between
      // preview and execute (e.g. someone else created a duplicate email).
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        "Import failed";
      setUploadError(msg);
      setStep("preview");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-gray-900">Import Users from Excel / CSV</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Upload step */}
          {step === "upload" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 border border-brand-200 px-4 py-2 rounded-lg hover:bg-brand-50"
                >
                  <Download className="h-4 w-4" /> Download Template
                </button>
                <span className="text-sm text-gray-500">Download a sample Excel file with the correct headers.</span>
              </div>

              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                  dragOver ? "border-brand-500 bg-brand-50" : "border-gray-300 hover:border-gray-400"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">Drag & drop your Excel or CSV file here</p>
                <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>

              {uploadError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {uploadError}
                </div>
              )}
            </div>
          )}

          {/* Preview step */}
          {step === "preview" && preview && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> {validRows.length} valid
                </span>
                {invalidRows.length > 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <XCircle className="h-4 w-4" /> {invalidRows.length} invalid
                  </span>
                )}
                <span className="text-gray-400">|</span>
                <span className="text-gray-500">{preview.totalRows} total rows</span>
                <button
                  onClick={() => { setStep("upload"); setPreview(null); setSelectedFile(null); }}
                  className="ml-auto text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Upload different file
                </button>
              </div>

              {uploadError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {uploadError}
                </div>
              )}

              {/* Error details */}
              {invalidRows.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-2">
                    <AlertTriangle className="h-4 w-4" /> Rows with errors (fix your file and re-upload)
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {invalidRows.map((err, i) => (
                      <p key={i} className="text-xs text-red-600">
                        <span className="font-medium">Row {err.row}:</span> {err.errors.join("; ")}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview table — all valid rows that will be imported */}
              {validRows.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-[40vh]">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">First Name</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Last Name</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Email</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Password</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Role</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Emp Code</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Designation</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Department</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Location</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Manager</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Joining</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {validRows.map((row, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">{row.first_name}</td>
                          <td className="px-3 py-2">{row.last_name}</td>
                          <td className="px-3 py-2">{row.email}</td>
                          <td className="px-3 py-2 text-gray-400">
                            {row.password ? "••••••••" : <em className="text-gray-400">invite</em>}
                          </td>
                          <td className="px-3 py-2">{row.role || "employee"}</td>
                          <td className="px-3 py-2">{row.emp_code}</td>
                          <td className="px-3 py-2">{row.designation}</td>
                          <td className="px-3 py-2">{row.department_name}</td>
                          <td className="px-3 py-2">{row.location_name}</td>
                          <td className="px-3 py-2">
                            {row.reporting_manager_email ||
                              row.reporting_manager_code ||
                              row.reporting_manager_name ||
                              ""}
                          </td>
                          <td className="px-3 py-2">{row.employment_type || "full_time"}</td>
                          <td className="px-3 py-2">{row.date_of_joining}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Importing step */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-10 w-10 text-brand-600 animate-spin" />
              <p className="text-sm text-gray-600">Importing users... please wait.</p>
            </div>
          )}

          {/* Done step */}
          {step === "done" && importResult && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 text-green-700 bg-green-50 border border-green-200 rounded-lg p-4">
                <CheckCircle2 className="h-6 w-6 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Import Complete</p>
                  <p className="text-sm mt-0.5">
                    {importResult.count} user{importResult.count !== 1 ? "s" : ""} imported successfully.
                  </p>
                </div>
              </div>

              {importResult.createdDepartments && importResult.createdDepartments.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-700 mb-1">
                    New departments created ({importResult.createdDepartments.length}):
                  </p>
                  <p className="text-xs text-blue-600">
                    {importResult.createdDepartments.join(", ")}
                  </p>
                </div>
              )}

              {importResult.createdLocations && importResult.createdLocations.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-700 mb-1">
                    New locations created ({importResult.createdLocations.length}):
                  </p>
                  <p className="text-xs text-blue-600">
                    {importResult.createdLocations.join(", ")}
                  </p>
                </div>
              )}

              {importResult.skipped && importResult.skipped.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-amber-700 mb-2">
                    Skipped {importResult.skipped.length} row{importResult.skipped.length !== 1 ? "s" : ""} with errors:
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {importResult.skipped.map((err, i) => (
                      <p key={i} className="text-xs text-amber-700">
                        <span className="font-medium">Row {err.row}:</span> {err.errors.join("; ")}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          {step === "preview" && validRows.length > 0 && (
            <button
              onClick={handleImport}
              className="flex items-center gap-2 bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              <Upload className="h-4 w-4" />
              Import {validRows.length} valid user{validRows.length !== 1 ? "s" : ""}
            </button>
          )}
          {step === "done" && (
            <button
              onClick={onClose}
              className="bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              Close
            </button>
          )}
          {(step === "upload" || step === "preview") && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main UsersPage
// ---------------------------------------------------------------------------

function usePendingInvitations(enabled: boolean = true) {
  return useQuery({
    queryKey: ["pending-invitations"],
    queryFn: () => api.get("/users/invitations", { params: { status: "pending" } }).then((r) => r.data.data).catch(() => []),
    enabled,
  });
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isOrgAdmin = !!user && ["org_admin", "super_admin"].includes(user.role);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useUsers({ page, search: search || undefined });
  const inviteUser = useInviteUser();
  const [showInvite, setShowInvite] = useState(false);

  const updateRoleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      api.put(`/users/${userId}`, { role }).then((r) => r.data.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("employee");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteDesignation, setInviteDesignation] = useState("");
  const [inviteDeptId, setInviteDeptId] = useState("");
  const [inviteManagerId, setInviteManagerId] = useState("");
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showAdvancedInvite, setShowAdvancedInvite] = useState(false);
  const { data: departmentsData } = useDepartments();
  const { data: allUsersData } = useUsers({ page: 1, per_page: 100 });
  const { data: pendingInvitations } = usePendingInvitations(isOrgAdmin);

  const users = data?.data || [];
  const meta = data?.meta;
  const departments = (departmentsData as any[]) || [];
  const invitations = (pendingInvitations as any[]) || [];

  const [inviteError, setInviteError] = useState("");

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    try {
      await inviteUser.mutateAsync({ email: inviteEmail, role: inviteRole as any });
      setInviteEmail("");
      setInviteRole("employee");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteDesignation("");
      setInviteDeptId("");
      setInviteManagerId("");
      setShowAdvancedInvite(false);
      setShowInvite(false);
    } catch (err: any) {
      setInviteError(err?.response?.data?.error?.message || "Failed to send invitation");
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 mt-1">Manage your organization's team members.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCsvImport(true)}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Import Users
          </button>
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="flex items-center gap-2 bg-brand-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-700 shadow-sm shadow-brand-200 transition-all"
          >
            <UserPlus className="h-5 w-5" /> Invite Employee
          </button>
        </div>
      </div>

      {/* CSV Import Modal */}
      {showCsvImport && <CsvImportModal onClose={() => setShowCsvImport(false)} />}

      {/* Invite form */}
      {showInvite && (
        <form onSubmit={handleInvite} className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="colleague@company.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="hr_admin">HR Admin</option>
                <option value="org_admin">Org Admin</option>
              </select>
            </div>
            <button type="button" onClick={() => setShowAdvancedInvite(!showAdvancedInvite)}
              className="text-sm text-brand-600 hover:underline whitespace-nowrap pb-2">
              {showAdvancedInvite ? "Less options" : "More options"}
            </button>
            <button type="submit" disabled={inviteUser.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              <Mail className="h-4 w-4" /> Send Invite
            </button>
          </div>
          {showAdvancedInvite && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input type="text" value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="John" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input type="text" value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Doe" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                <input type="text" value={inviteDesignation} onChange={(e) => setInviteDesignation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Software Engineer" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select value={inviteDeptId} onChange={(e) => setInviteDeptId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">Select department</option>
                  {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Reporting Manager</label>
                <select value={inviteManagerId} onChange={(e) => setInviteManagerId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">No manager (top level)</option>
                  {(allUsersData?.data || []).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.first_name} {u.last_name} — {u.designation || u.role}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {inviteError && (
            <p className="text-sm text-red-600 mt-2">{inviteError}</p>
          )}
        </form>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="Search by name, email, or employee code..."
        />
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">Pending Invitations ({invitations.length})</h3>
          <div className="space-y-2">
            {invitations.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-amber-100">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-sm font-semibold text-amber-700">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-900">{inv.email}</span>
                    <span className="text-xs text-gray-500 ml-2 capitalize">{(inv.role || "employee").replace(/_/g, " ")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Pending</span>
                  <span className="text-xs text-gray-400">
                    Invited {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Name</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Email</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Role</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No users found</td></tr>
            ) : (
              users.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">
                        {u.first_name?.[0]}{u.last_name?.[0]}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{u.first_name || ""} {u.last_name || ""}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{u.email}</td>
                  <td className="px-6 py-4">
                    {isOrgAdmin && u.id !== user?.id ? (
                      <select
                        value={u.role}
                        onChange={(e) => updateRoleMut.mutate({ userId: u.id, role: e.target.value })}
                        className="text-xs border border-gray-200 rounded-full px-2 py-1 bg-gray-50 text-gray-700 capitalize cursor-pointer hover:bg-gray-100"
                        disabled={updateRoleMut.isPending}
                      >
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                        <option value="hr_admin">HR Admin</option>
                        <option value="org_admin">Org Admin</option>
                      </select>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full capitalize">
                        {u.role.replace(/_/g, " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      u.status === 1 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    }`}>
                      {u.status === 1 ? "Active" : "Inactive"}
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
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
