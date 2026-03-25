import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, CheckCircle2, XCircle, FileSpreadsheet, AlertTriangle } from "lucide-react";
import api from "@/api/client";

interface ImportError {
  row: number;
  data: Record<string, string>;
  errors: string[];
}

interface PreviewResult {
  valid: Record<string, string>[];
  errors: ImportError[];
  totalRows: number;
}

export default function ImportEmployeesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [importResult, setImportResult] = useState<{ count: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const previewMutation = useMutation({
    mutationFn: (f: File) => {
      const formData = new FormData();
      formData.append("file", f);
      return api
        .post("/users/import", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then((r) => r.data.data as PreviewResult);
    },
    onSuccess: (data) => setPreview(data),
  });

  const executeMutation = useMutation({
    mutationFn: (f: File) => {
      const formData = new FormData();
      formData.append("file", f);
      return api
        .post("/users/import/execute", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then((r) => r.data.data as { count: number });
    },
    onSuccess: (data) => {
      setImportResult(data);
      setPreview(null);
      setFile(null);
    },
  });

  const handleFile = useCallback(
    (f: File) => {
      if (!f.name.endsWith(".csv")) return;
      setFile(f);
      setPreview(null);
      setImportResult(null);
      previewMutation.mutate(f);
    },
    [previewMutation]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
    },
    [handleFile]
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Import Employees</h1>
        <p className="text-gray-500 mt-1">
          Upload a CSV file to bulk import employees into your organization.
        </p>
      </div>

      {/* Success message */}
      {importResult && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-6 flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-green-800">Import Successful</h3>
            <p className="text-green-700 mt-1">
              Successfully imported {importResult.count} employee{importResult.count !== 1 ? "s" : ""}.
            </p>
            <button
              onClick={() => setImportResult(null)}
              className="mt-3 text-sm text-green-700 underline hover:text-green-900"
            >
              Import more employees
            </button>
          </div>
        </div>
      )}

      {/* Upload dropzone */}
      {!importResult && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            dragActive
              ? "border-brand-400 bg-brand-50"
              : "border-gray-300 bg-white hover:border-gray-400"
          }`}
        >
          <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">
            Drag and drop a CSV file here, or click to browse
          </p>
          <p className="text-xs text-gray-400 mb-4">
            Required columns: first_name, last_name, email. Optional: designation, department_name, emp_code, role, contact_number
          </p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 cursor-pointer transition-colors">
            <Upload className="h-4 w-4" />
            Choose File
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
          {file && (
            <p className="mt-3 text-sm text-gray-500">
              Selected: {file.name}
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {previewMutation.isPending && (
        <div className="mt-6 text-center text-gray-400">Parsing and validating CSV...</div>
      )}

      {/* Preview results */}
      {preview && (
        <div className="mt-6 space-y-6">
          {/* Summary */}
          <div className="flex gap-4">
            <div className="flex-1 bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-500">Total Rows</p>
              <p className="text-2xl font-bold text-gray-900">{preview.totalRows}</p>
            </div>
            <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm text-green-600">Valid</p>
              <p className="text-2xl font-bold text-green-700">{preview.valid.length}</p>
            </div>
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-600">Errors</p>
              <p className="text-2xl font-bold text-red-700">{preview.errors.length}</p>
            </div>
          </div>

          {/* Valid rows table */}
          {preview.valid.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <h3 className="text-sm font-medium text-gray-700">
                  Valid Employees ({preview.valid.length})
                </h3>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2">Name</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2">Email</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2">Emp Code</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2">Designation</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2">Department</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.valid.slice(0, 50).map((row: any, i: number) => (
                    <tr key={i}>
                      <td className="px-6 py-2 text-sm text-gray-900">
                        {row.first_name} {row.last_name}
                      </td>
                      <td className="px-6 py-2 text-sm text-gray-500">{row.email}</td>
                      <td className="px-6 py-2 text-sm text-gray-500">
                        {row.emp_code || "-"}
                      </td>
                      <td className="px-6 py-2 text-sm text-gray-500">
                        {row.designation || "-"}
                      </td>
                      <td className="px-6 py-2 text-sm text-gray-500">
                        {row.department_name || "-"}
                      </td>
                      <td className="px-6 py-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.valid.length > 50 && (
                <div className="px-6 py-2 text-sm text-gray-400 border-t border-gray-100">
                  ...and {preview.valid.length - 50} more
                </div>
              )}
            </div>
          )}

          {/* Error rows */}
          {preview.errors.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
              <div className="px-6 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <h3 className="text-sm font-medium text-red-700">
                  Errors ({preview.errors.length})
                </h3>
              </div>
              <table className="w-full">
                <thead className="bg-red-50 border-b border-red-100">
                  <tr>
                    <th className="text-left text-xs font-medium text-red-500 uppercase px-6 py-2">Row</th>
                    <th className="text-left text-xs font-medium text-red-500 uppercase px-6 py-2">Name</th>
                    <th className="text-left text-xs font-medium text-red-500 uppercase px-6 py-2">Email</th>
                    <th className="text-left text-xs font-medium text-red-500 uppercase px-6 py-2">Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50">
                  {preview.errors.map((err, i) => (
                    <tr key={i}>
                      <td className="px-6 py-2 text-sm text-gray-900">{err.row}</td>
                      <td className="px-6 py-2 text-sm text-gray-500">
                        {err.data.first_name} {err.data.last_name}
                      </td>
                      <td className="px-6 py-2 text-sm text-gray-500">{err.data.email}</td>
                      <td className="px-6 py-2">
                        <ul className="text-xs text-red-600 space-y-0.5">
                          {err.errors.map((e, j) => (
                            <li key={j} className="flex items-center gap-1">
                              <XCircle className="h-3 w-3 shrink-0" />
                              {e}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Import button */}
          {preview.valid.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={() => file && executeMutation.mutate(file)}
                disabled={executeMutation.isPending}
                className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {executeMutation.isPending ? (
                  "Importing..."
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Import {preview.valid.length} valid employee{preview.valid.length !== 1 ? "s" : ""}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
