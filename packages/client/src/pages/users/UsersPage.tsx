import { useUsers, useInviteUser, useCreateUser, useDepartments } from "@/api/hooks";
import { useState, useRef, useCallback } from "react";
import { UserPlus, Search, Mail, Upload, Download, X, CheckCircle2, XCircle, FileSpreadsheet, AlertTriangle, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// CSV Import types & helpers
// ---------------------------------------------------------------------------

interface CsvRow {
  first_name: string;
  last_name: string;
  email: string;
  designation: string;
  department: string;
  role: string;
  employment_type: string;
  date_of_joining: string;
  contact_number: string;
}

interface ParsedRow extends CsvRow {
  _rowNum: number;
  _errors: string[];
  _valid: boolean;
}

const CSV_HEADERS = [
  "first_name", "last_name", "email", "designation", "department",
  "role", "employment_type", "date_of_joining", "contact_number",
];

const SAMPLE_CSV = `first_name,last_name,email,designation,department,role,employment_type,date_of_joining,contact_number
John,Doe,john@company.com,Software Engineer,Engineering,employee,full_time,2026-01-15,+91-9876543210
Jane,Smith,jane@company.com,Product Manager,Product,manager,full_time,2025-06-01,+91-9876543211
Raj,Patel,raj@company.com,Senior Designer,Design,employee,full_time,2026-03-01,+91-9876543212`;

const VALID_ROLES = ["employee", "hr_manager", "hr_admin", "org_admin", "manager"];
const VALID_EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row: any = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });
    return row as CsvRow;
  });
}

function validateRows(rows: CsvRow[], departmentNames: string[]): ParsedRow[] {
  const emailsSeen = new Set<string>();
  const deptLower = departmentNames.map((d) => d.toLowerCase());

  return rows.map((row, idx) => {
    const errors: string[] = [];

    if (!row.first_name) errors.push("First name is required");
    if (!row.last_name) errors.push("Last name is required");
    if (!row.email) {
      errors.push("Email is required");
    } else if (!EMAIL_RE.test(row.email)) {
      errors.push("Invalid email format");
    } else if (emailsSeen.has(row.email.toLowerCase())) {
      errors.push("Duplicate email in CSV");
    }
    if (row.email) emailsSeen.add(row.email.toLowerCase());

    if (row.department && !deptLower.includes(row.department.toLowerCase())) {
      errors.push(`Unknown department "${row.department}"`);
    }
    if (row.role && !VALID_ROLES.includes(row.role)) {
      errors.push(`Invalid role "${row.role}"`);
    }
    if (row.employment_type && !VALID_EMPLOYMENT_TYPES.includes(row.employment_type)) {
      errors.push(`Invalid employment type "${row.employment_type}"`);
    }

    return { ...row, _rowNum: idx + 2, _errors: errors, _valid: errors.length === 0 };
  });
}

// ---------------------------------------------------------------------------
// CSV Import Modal
// ---------------------------------------------------------------------------

function CsvImportModal({
  onClose,
  departments,
}: {
  onClose: () => void;
  departments: { id: number; name: string }[];
}) {
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; failed: number; errors: string[] }>({ success: 0, failed: 0, errors: [] });
  const fileRef = useRef<HTMLInputElement>(null);
  const createUser = useCreateUser();

  const departmentNames = departments.map((d) => d.name);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const rows = parseCsv(text);
        const validated = validateRows(rows, departmentNames);
        setParsedRows(validated);
        setStep("preview");
      };
      reader.readAsText(file);
    },
    [departmentNames]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) handleFile(file);
    },
    [handleFile]
  );

  const downloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const validRows = parsedRows.filter((r) => r._valid);
  const invalidRows = parsedRows.filter((r) => !r._valid);

  const handleImport = async () => {
    setStep("importing");
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of validRows) {
      try {
        const deptMatch = departments.find((d) => d.name.toLowerCase() === (row.department || "").toLowerCase());
        await createUser.mutateAsync({
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          designation: row.designation || undefined,
          department_id: deptMatch?.id || undefined,
          role: row.role || "employee",
          employment_type: row.employment_type || "full_time",
          date_of_joining: row.date_of_joining || undefined,
          contact_number: row.contact_number || undefined,
        } as any);
        success++;
      } catch (err: any) {
        failed++;
        const msg = err?.response?.data?.message || err.message || "Unknown error";
        errors.push(`Row ${row._rowNum} (${row.email}): ${msg}`);
      }
    }

    setImportResults({ success, failed, errors });
    setStep("done");
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
            <h2 className="text-lg font-semibold text-gray-900">Import Users from CSV</h2>
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
                <span className="text-sm text-gray-500">Download a sample CSV with the correct headers.</span>
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
                <p className="text-sm font-medium text-gray-700">Drag & drop your CSV file here</p>
                <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>
            </div>
          )}

          {/* Preview step */}
          {step === "preview" && (
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
                <span className="text-gray-500">{parsedRows.length} total rows</span>
                <button
                  onClick={() => { setStep("upload"); setParsedRows([]); }}
                  className="ml-auto text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Upload different file
                </button>
              </div>

              {/* Error details */}
              {invalidRows.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-2">
                    <AlertTriangle className="h-4 w-4" /> Rows with errors (will be skipped)
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {invalidRows.map((row) => (
                      <p key={row._rowNum} className="text-xs text-red-600">
                        <span className="font-medium">Row {row._rowNum}:</span> {row._errors.join("; ")}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview table */}
              <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-[40vh]">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Row</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">First Name</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Last Name</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Email</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Designation</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Department</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsedRows.map((row) => (
                      <tr key={row._rowNum} className={row._valid ? "" : "bg-red-50/50"}>
                        <td className="px-3 py-2">
                          {row._valid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-400">{row._rowNum}</td>
                        <td className="px-3 py-2">{row.first_name}</td>
                        <td className="px-3 py-2">{row.last_name}</td>
                        <td className="px-3 py-2">{row.email}</td>
                        <td className="px-3 py-2">{row.designation}</td>
                        <td className="px-3 py-2">{row.department}</td>
                        <td className="px-3 py-2">{row.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
          {step === "done" && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 text-green-700 bg-green-50 border border-green-200 rounded-lg p-4">
                <CheckCircle2 className="h-6 w-6 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Import Complete</p>
                  <p className="text-sm mt-0.5">
                    {importResults.success} user{importResults.success !== 1 ? "s" : ""} imported successfully.
                    {importResults.failed > 0 && ` ${importResults.failed} failed.`}
                  </p>
                </div>
              </div>

              {importResults.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-700 mb-2">Failed rows:</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {importResults.errors.map((err, i) => (
                      <p key={i} className="text-xs text-red-600">{err}</p>
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

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useUsers({ page, search: search || undefined });
  const inviteUser = useInviteUser();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("employee");
  const [showCsvImport, setShowCsvImport] = useState(false);
  const { data: departmentsData } = useDepartments();

  const users = data?.data || [];
  const meta = data?.meta;
  const departments = (departmentsData as any[]) || [];

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    await inviteUser.mutateAsync({ email: inviteEmail, role: inviteRole as any });
    setInviteEmail("");
    setShowInvite(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 mt-1">Manage your organization's team members.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCsvImport(true)}
            className="flex items-center gap-2 border border-brand-200 text-brand-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Import CSV
          </button>
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            <UserPlus className="h-4 w-4" /> Invite User
          </button>
        </div>
      </div>

      {/* CSV Import Modal */}
      {showCsvImport && (
        <CsvImportModal
          onClose={() => setShowCsvImport(false)}
          departments={departments}
        />
      )}

      {/* Invite form */}
      {showInvite && (
        <form onSubmit={handleInvite} className="bg-white rounded-xl border border-gray-200 p-6 mb-6 flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
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
              <option value="hr_manager">HR Manager</option>
              <option value="hr_admin">HR Admin</option>
              <option value="org_admin">Org Admin</option>
            </select>
          </div>
          <button type="submit" disabled={inviteUser.isPending} className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            <Mail className="h-4 w-4" /> Send Invite
          </button>
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
                        {u.first_name[0]}{u.last_name[0]}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{u.first_name} {u.last_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full capitalize">
                      {u.role.replace(/_/g, " ")}
                    </span>
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
