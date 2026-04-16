// ============================================================================
// AssetBulkUploadModal
// CSV / XLSX bulk-import modal for assets. Mirrors CsvImportUsersModal but is
// simpler — the server endpoint handles parse + validate + execute in a
// single round-trip and returns { imported, errors } so we skip the preview
// step.
// Calls: POST /assets/bulk   (multipart)
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

// Small, opinionated template. Three example rows cover the common shapes
// (full detail, minimal, category-only) so HR can see exactly what headers
// are supported without reading docs.
const TEMPLATE_HEADERS = [
  "name",
  "category_name",
  "serial_number",
  "brand",
  "model",
  "purchase_date",
  "purchase_cost",
  "warranty_expiry",
  "condition_status",
  "location_name",
  "description",
  "notes",
];

const TEMPLATE_SAMPLE_ROWS: Array<Record<string, string>> = [
  {
    name: "MacBook Pro 14",
    category_name: "Laptop",
    serial_number: "C02XK1ABCDEF",
    brand: "Apple",
    model: "M3 Pro",
    purchase_date: "2026-01-15",
    purchase_cost: "250000",
    warranty_expiry: "2029-01-14",
    condition_status: "new",
    location_name: "HQ Floor 3",
    description: "Engineering laptop",
    notes: "",
  },
  {
    name: "Dell Monitor 27",
    category_name: "Monitor",
    serial_number: "",
    brand: "Dell",
    model: "U2723QE",
    purchase_date: "",
    purchase_cost: "",
    warranty_expiry: "",
    condition_status: "good",
    location_name: "",
    description: "",
    notes: "",
  },
  {
    name: "Office Chair",
    category_name: "Furniture",
    serial_number: "",
    brand: "",
    model: "",
    purchase_date: "2024-06-01",
    purchase_cost: "15000",
    warranty_expiry: "",
    condition_status: "good",
    location_name: "HQ Floor 2",
    description: "",
    notes: "",
  },
];

interface BulkImportError {
  row: number;
  data: Record<string, unknown>;
  errors: string[];
}

interface BulkImportResult {
  imported: number;
  errors: BulkImportError[];
  createdCategories: string[];
}

interface Props {
  onClose: () => void;
}

export default function AssetBulkUploadModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"upload" | "importing" | "done">("upload");
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      setStep("importing");
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await api.post<{ data: BulkImportResult }>(
          "/assets/bulk",
          form,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
        setResult(res.data.data);
        queryClient.invalidateQueries({ queryKey: ["assets"] });
        queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
        setStep("done");
      } catch (err: any) {
        const msg =
          err?.response?.data?.error?.message ||
          err?.message ||
          "Bulk import failed";
        setUploadError(msg);
        setStep("upload");
      }
    },
    [queryClient],
  );

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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Assets");
    XLSX.writeFile(workbook, "assets_import_template.xlsx");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Bulk Import Assets from CSV / Excel
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
                  Required: <code className="text-xs bg-gray-100 px-1 rounded">name</code>. Other columns are optional.
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
                  Drag &amp; drop your CSV or Excel file here
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

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 space-y-1">
                <p>
                  <strong>Tips:</strong>
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li><code>purchase_cost</code> is the amount in paise (e.g. 150000 for ₹1,500).</li>
                  <li><code>condition_status</code> must be one of: new, good, fair, poor.</li>
                  <li>Unknown <code>category_name</code> values are auto-created.</li>
                  <li>Dates accept YYYY-MM-DD or Excel date cells.</li>
                </ul>
              </div>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-10 w-10 text-brand-600 animate-spin" />
              <p className="text-sm text-gray-600">Importing assets... please wait.</p>
            </div>
          )}

          {step === "done" && result && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 text-green-700 bg-green-50 border border-green-200 rounded-lg p-4">
                <CheckCircle2 className="h-6 w-6 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Import Complete</p>
                  <p className="text-sm mt-0.5">
                    {result.imported} asset{result.imported !== 1 ? "s" : ""} imported successfully.
                  </p>
                </div>
              </div>

              {result.createdCategories && result.createdCategories.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-700 mb-1">
                    New categories created ({result.createdCategories.length}):
                  </p>
                  <p className="text-xs text-blue-600">
                    {result.createdCategories.join(", ")}
                  </p>
                </div>
              )}

              {result.errors && result.errors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-amber-700 font-medium text-sm mb-2">
                    <AlertTriangle className="h-4 w-4" /> Skipped {result.errors.length} row
                    {result.errors.length !== 1 ? "s" : ""} with errors
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {result.errors.map((err, i) => (
                      <p key={i} className="text-xs text-amber-700">
                        <span className="font-medium">Row {err.row}:</span> {err.errors.join("; ")}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {result.imported === 0 && result.errors.length === 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600 flex items-center gap-2">
                  <XCircle className="h-4 w-4" /> No rows found in the uploaded file.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          {step === "done" ? (
            <button
              onClick={onClose}
              className="bg-brand-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
            >
              Close
            </button>
          ) : (
            <button
              onClick={onClose}
              disabled={step === "importing"}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
