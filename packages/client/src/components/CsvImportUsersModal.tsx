// ============================================================================
// CsvImportUsersModal
// Shared Excel / CSV import modal for bulk-creating users/employees.
// Originally lived inside pages/users/UsersPage.tsx; extracted here so the
// Employees page (which absorbed the Users page) can reuse it.
// Calls the existing server endpoints:
//   POST /users/import          — parse + validate preview
//   POST /users/import/execute  — commit the batch
// ============================================================================

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  Download,
  X,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import api from "@/api/client";
import * as XLSX from "xlsx";

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
    location_name: "Bhilai",
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

interface Props {
  onClose: () => void;
  /** Extra React Query keys to invalidate after a successful import. */
  invalidateKeys?: string[];
}

export default function CsvImportUsersModal({ onClose, invalidateKeys = [] }: Props) {
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
      const res = await api.post<{
        data: {
          count: number;
          createdDepartments?: string[];
          createdLocations?: string[];
          skipped?: Array<{ row: number; data?: Record<string, unknown>; errors: string[] }>;
          totalRows?: number;
        };
      }>("/users/import/execute", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(res.data.data);
      // Invalidate both the users and employee-directory caches so either
      // page reflects the newly-created rows immediately.
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["employee-directory"] });
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      setStep("done");
    } catch (err: any) {
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Import Employees from Excel / CSV
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === "upload" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 border border-brand-200 px-4 py-2 rounded-lg hover:bg-brand-50"
                >
                  <Download className="h-4 w-4" /> Download Template
                </button>
                <span className="text-sm text-gray-500">
                  Download a sample Excel file with the correct headers.
                </span>
              </div>

              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                  dragOver ? "border-brand-500 bg-brand-50" : "border-gray-300 hover:border-gray-400"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">
                  Drag & drop your Excel or CSV file here
                </p>
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
                  onClick={() => {
                    setStep("upload");
                    setPreview(null);
                    setSelectedFile(null);
                  }}
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

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-10 w-10 text-brand-600 animate-spin" />
              <p className="text-sm text-gray-600">Importing employees... please wait.</p>
            </div>
          )}

          {step === "done" && importResult && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 text-green-700 bg-green-50 border border-green-200 rounded-lg p-4">
                <CheckCircle2 className="h-6 w-6 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Import Complete</p>
                  <p className="text-sm mt-0.5">
                    {importResult.count} employee{importResult.count !== 1 ? "s" : ""} imported
                    successfully.
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
                    Skipped {importResult.skipped.length} row
                    {importResult.skipped.length !== 1 ? "s" : ""} with errors:
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
              Import {validRows.length} valid employee{validRows.length !== 1 ? "s" : ""}
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
