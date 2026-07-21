import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import api from "@/api/client";
import {
  FileText,
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  X,
} from "lucide-react";
import { showToast } from "@/components/ui/Toast";

// --- Hooks ---

function useMyDocuments(page: number) {
  return useQuery({
    queryKey: ["my-documents", page],
    queryFn: () => api.get("/documents/my", { params: { page } }).then((r) => r.data),
  });
}

function useDocCategories() {
  return useQuery({
    queryKey: ["doc-categories"],
    queryFn: () => api.get("/documents/categories").then((r) => r.data.data),
  });
}

function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      api
        .post("/documents/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-documents"] }),
  });
}

// --- Helpers ---

function getExpiryStatus(expiresAt: string | null): "ok" | "warning" | "expired" | null {
  if (!expiresAt) return null;
  const now = new Date();
  const expiry = new Date(expiresAt);
  if (expiry < now) return "expired";
  const daysUntil = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntil <= 30) return "warning";
  return "ok";
}

function getVerificationBadge(doc: any, t: TFunction) {
  const status = doc.verification_status || (doc.is_verified ? "verified" : "pending");
  switch (status) {
    case "verified":
      return (
        <span className="flex items-center gap-1 text-[11px] text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 px-2 py-0.5 rounded-md w-fit">
          <CheckCircle className="h-3 w-3" /> {t("myDocuments.status.verified")}
        </span>
      );
    case "rejected":
      return (
        <span className="flex items-center gap-1 text-[11px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-md w-fit">
          <XCircle className="h-3 w-3" /> {t("myDocuments.status.rejected")}
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md w-fit">
          <Clock className="h-3 w-3" /> {t("myDocuments.status.pending")}
        </span>
      );
  }
}

// --- Download helper ---

async function downloadDocument(docId: number, docName: string) {
  const response = await api.get(`/documents/${docId}/download`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", docName || "document");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// --- Component ---

export default function MyDocumentsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadExpiry, setUploadExpiry] = useState("");

  const { data: docsData, isLoading } = useMyDocuments(page);
  const { data: categories = [] } = useDocCategories();
  const uploadDoc = useUploadDocument();

  const docs = docsData?.data || [];
  const meta = docsData?.meta;

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadCategory) return;

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("category_id", uploadCategory);
    formData.append("name", uploadName || uploadFile.name);
    if (uploadExpiry) formData.append("expires_at", uploadExpiry);

    await uploadDoc.mutateAsync(formData);
    setShowUpload(false);
    setUploadFile(null);
    setUploadName("");
    setUploadCategory("");
    setUploadExpiry("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("myDocuments.page.title")}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {t("myDocuments.page.subtitle")}
          </p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700"
        >
          <Upload className="h-4 w-4" /> {t("myDocuments.actions.uploadDocument")}
        </button>
      </div>

      {/* Upload Form */}
      {showUpload && (
        <form
          onSubmit={handleUpload}
          className="bg-card rounded-lg border border-border p-4 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">{t("myDocuments.upload.heading")}</h3>
            <button
              type="button"
              onClick={() => setShowUpload(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">
                {t("myDocuments.upload.fileLabel")}
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">
                {t("myDocuments.upload.nameLabel")}
              </label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px]"
                placeholder={t("myDocuments.upload.namePlaceholder")}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">
                {t("myDocuments.upload.categoryLabel")}
              </label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px]"
                required
              >
                <option value="">{t("myDocuments.upload.categoryPlaceholder")}</option>
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">
                {t("myDocuments.upload.expiryLabel")}
              </label>
              <input
                type="date"
                value={uploadExpiry}
                onChange={(e) => setUploadExpiry(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px]"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={uploadDoc.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />{" "}
              {uploadDoc.isPending
                ? t("myDocuments.upload.submitting")
                : t("myDocuments.upload.submit")}
            </button>
          </div>
        </form>
      )}

      {/* Documents List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">{t("myDocuments.list.loading")}</div>
        ) : docs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">{t("myDocuments.list.empty")}</p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-3 text-[13px] text-brand-600 dark:text-brand-400 font-medium hover:text-brand-800 dark:hover:text-brand-300"
            >
              {t("myDocuments.list.uploadFirst")}
            </button>
          </div>
        ) : (
          docs.map((doc: any) => {
            const expiryStatus = getExpiryStatus(doc.expires_at);
            const isRejected =
              doc.verification_status === "rejected" ||
              (!doc.verification_status && !doc.is_verified);

            return (
              <div
                key={doc.id}
                className={`bg-card rounded-lg border p-4 ${
                  expiryStatus === "expired"
                    ? "border-red-200 dark:border-red-900/50"
                    : expiryStatus === "warning"
                      ? "border-orange-200 dark:border-orange-900/50"
                      : "border-border"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-10 w-10 rounded-md flex items-center justify-center ${
                        expiryStatus === "expired"
                          ? "bg-red-50 dark:bg-red-950/40"
                          : expiryStatus === "warning"
                            ? "bg-orange-50 dark:bg-orange-950/40"
                            : "bg-muted"
                      }`}
                    >
                      <FileText
                        className={`h-5 w-5 ${
                          expiryStatus === "expired"
                            ? "text-red-500 dark:text-red-400"
                            : expiryStatus === "warning"
                              ? "text-orange-500 dark:text-orange-400"
                              : "text-muted-foreground"
                        }`}
                      />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-foreground">{doc.name}</p>
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        {doc.category_name} &middot;{" "}
                        {doc.file_size
                          ? `${(doc.file_size / 1024).toFixed(0)} KB`
                          : ""}
                        {doc.mime_type ? ` &middot; ${doc.mime_type}` : ""}
                      </p>
                      {doc.expires_at && (
                        <p
                          className={`text-[11px] tabular-nums mt-1 flex items-center gap-1 ${
                            expiryStatus === "expired"
                              ? "text-red-600 dark:text-red-400"
                              : expiryStatus === "warning"
                                ? "text-orange-600 dark:text-orange-400"
                                : "text-muted-foreground"
                          }`}
                        >
                          {expiryStatus === "expired" && (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          {expiryStatus === "warning" && (
                            <Clock className="h-3 w-3" />
                          )}
                          {expiryStatus === "expired"
                            ? t("myDocuments.expiry.expired")
                            : expiryStatus === "warning"
                              ? t("myDocuments.expiry.expiringSoon")
                              : t("myDocuments.expiry.expires")}{" "}
                          {new Date(doc.expires_at).toLocaleDateString()}
                        </p>
                      )}
                      {doc.verification_status === "rejected" && doc.rejection_reason && (
                        <p className="text-xs text-red-600 mt-1">
                          {t("myDocuments.doc.rejectionReason", {
                            reason: doc.rejection_reason,
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getVerificationBadge(doc, t)}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await downloadDocument(doc.id, doc.name);
                          } catch {
                            showToast("error", t("myDocuments.toast.downloadFailed"));
                          }
                        }}
                        className="text-[11px] text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 font-medium"
                      >
                        {t("myDocuments.doc.download")}
                      </button>
                      {(doc.verification_status === "rejected" || isRejected) && (
                        <button
                          onClick={() => setShowUpload(true)}
                          className="text-[11px] text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 font-medium"
                        >
                          {t("myDocuments.doc.reupload")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-[13px] tabular-nums text-muted-foreground">
            {t("myDocuments.pagination.summary", {
              page: meta.page,
              totalPages: meta.total_pages,
              count: meta.total,
            })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-[13px] border border-border rounded-md disabled:opacity-50 hover:bg-muted transition-colors"
            >
              {t("myDocuments.pagination.previous")}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="px-3 py-1.5 text-[13px] border border-border rounded-md disabled:opacity-50 hover:bg-muted transition-colors"
            >
              {t("myDocuments.pagination.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
