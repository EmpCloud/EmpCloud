import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("importEmployees.page.title")}</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          {t("importEmployees.page.subtitle")}
        </p>
      </div>

      {/* Success message */}
      {importResult && (
        <div className="mb-6 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/40 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-base font-semibold text-green-800 dark:text-green-300">{t("importEmployees.success.title")}</h3>
            <p className="text-[13px] text-green-700 dark:text-green-300 mt-1">
              {t("importEmployees.success.message", { count: importResult.count })}
            </p>
            <button
              onClick={() => setImportResult(null)}
              className="mt-3 text-[13px] text-green-700 dark:text-green-300 underline hover:text-green-900 dark:hover:text-green-200"
            >
              {t("importEmployees.success.importMore")}
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
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            dragActive
              ? "border-brand-400 bg-brand-50"
              : "border-border bg-card hover:border-brand-400"
          }`}
        >
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-[13px] text-muted-foreground mb-2">
            {t("importEmployees.dropzone.instructions")}
          </p>
          <p className="text-[11px] text-muted-foreground mb-4">
            {t("importEmployees.dropzone.columnsHint")}
          </p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-md text-[13px] font-medium hover:bg-brand-700 cursor-pointer transition-colors">
            <Upload className="h-4 w-4" />
            {t("importEmployees.dropzone.chooseFile")}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
          {file && (
            <p className="mt-3 text-[13px] text-muted-foreground">
              {t("importEmployees.dropzone.selectedFile", { name: file.name })}
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {previewMutation.isPending && (
        <div className="mt-6 text-center text-[13px] text-muted-foreground">{t("importEmployees.loading.parsing")}</div>
      )}

      {/* Preview results */}
      {preview && (
        <div className="mt-6 space-y-6">
          {/* Summary */}
          <div className="flex gap-2.5">
            <div className="flex-1 bg-card border border-border rounded-lg p-4">
              <p className="text-[13px] text-muted-foreground">{t("importEmployees.summary.totalRows")}</p>
              <p className="text-2xl font-bold tabular-nums text-foreground">{preview.totalRows}</p>
            </div>
            <div className="flex-1 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/40 rounded-lg p-4">
              <p className="text-[13px] text-green-600 dark:text-green-400">{t("importEmployees.summary.valid")}</p>
              <p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300">{preview.valid.length}</p>
            </div>
            <div className="flex-1 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 rounded-lg p-4">
              <p className="text-[13px] text-red-600 dark:text-red-400">{t("importEmployees.summary.errors")}</p>
              <p className="text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">{preview.errors.length}</p>
            </div>
          </div>

          {/* Valid rows table */}
          {preview.valid.length > 0 && (
            <div className="bg-card rounded-lg border border-border overflow-x-auto -mx-4 lg:mx-0">
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground tabular-nums">
                  {t("importEmployees.validTable.title", { count: preview.valid.length })}
                </h3>
              </div>
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("importEmployees.validTable.col.name")}</th>
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("importEmployees.validTable.col.email")}</th>
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("importEmployees.validTable.col.empCode")}</th>
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("importEmployees.validTable.col.designation")}</th>
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("importEmployees.validTable.col.department")}</th>
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">{t("importEmployees.validTable.col.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.valid.slice(0, 50).map((row: any, i: number) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-[13px] text-foreground">
                        {row.first_name} {row.last_name}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{row.email}</td>
                      <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                        {row.emp_code || t("importEmployees.validTable.emptyCell")}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                        {row.designation || t("importEmployees.validTable.emptyCell")}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                        {row.department_name || t("importEmployees.validTable.emptyCell")}
                      </td>
                      <td className="px-4 py-2.5">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.valid.length > 50 && (
                <div className="px-4 py-2.5 text-[13px] tabular-nums text-muted-foreground border-t border-border">
                  {t("importEmployees.validTable.andMore", { count: preview.valid.length - 50 })}
                </div>
              )}
            </div>
          )}

          {/* Error rows */}
          {preview.errors.length > 0 && (
            <div className="bg-card rounded-lg border border-red-200 dark:border-red-900/40 overflow-hidden">
              <div className="px-4 py-2.5 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/40 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300 tabular-nums">
                  {t("importEmployees.errorTable.title", { count: preview.errors.length })}
                </h3>
              </div>
              <table className="w-full">
                <thead className="bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-900/40">
                  <tr>
                    <th className="text-left text-[11px] font-semibold text-red-500 uppercase tracking-wider px-4 py-2.5">{t("importEmployees.errorTable.col.row")}</th>
                    <th className="text-left text-[11px] font-semibold text-red-500 uppercase tracking-wider px-4 py-2.5">{t("importEmployees.errorTable.col.name")}</th>
                    <th className="text-left text-[11px] font-semibold text-red-500 uppercase tracking-wider px-4 py-2.5">{t("importEmployees.errorTable.col.email")}</th>
                    <th className="text-left text-[11px] font-semibold text-red-500 uppercase tracking-wider px-4 py-2.5">{t("importEmployees.errorTable.col.errors")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50 dark:divide-red-900/30">
                  {preview.errors.map((err, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-[13px] tabular-nums text-foreground">{err.row}</td>
                      <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                        {err.data.first_name} {err.data.last_name}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{err.data.email}</td>
                      <td className="px-4 py-2.5">
                        <ul className="text-[11px] text-red-600 dark:text-red-400 space-y-0.5">
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
                className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {executeMutation.isPending ? (
                  t("importEmployees.import.importing")
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {t("importEmployees.import.button", { count: preview.valid.length })}
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
