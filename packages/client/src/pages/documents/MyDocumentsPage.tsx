import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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

function getVerificationBadge(doc: any) {
  const status = doc.verification_status || (doc.is_verified ? "verified" : "pending");
  switch (status) {
    case "verified":
      return (
        <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full w-fit">
          <CheckCircle className="h-3 w-3" /> Verified
        </span>
      );
    case "rejected":
      return (
        <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded-full w-fit">
          <XCircle className="h-3 w-3" /> Rejected
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full w-fit">
          <Clock className="h-3 w-3" /> Pending
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Documents</h1>
          <p className="text-gray-500 mt-1">
            Upload, view, and track the status of your documents.
          </p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Upload className="h-4 w-4" /> Upload Document
        </button>
      </div>

      {/* Upload Form */}
      {showUpload && (
        <form
          onSubmit={handleUpload}
          className="bg-white rounded-xl border border-gray-200 p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Upload Document</h3>
            <button
              type="button"
              onClick={() => setShowUpload(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                File *
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Name
              </label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Optional - defaults to file name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category *
              </label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              >
                <option value="">Select category</option>
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expiry Date
              </label>
              <input
                type="date"
                value={uploadExpiry}
                onChange={(e) => setUploadExpiry(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={uploadDoc.isPending}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />{" "}
              {uploadDoc.isPending ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      )}

      {/* Documents List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading your documents...</div>
        ) : docs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">You haven't uploaded any documents yet.</p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-3 text-sm text-brand-600 font-medium hover:text-brand-800"
            >
              Upload your first document
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
                className={`bg-white rounded-xl border p-4 ${
                  expiryStatus === "expired"
                    ? "border-red-200"
                    : expiryStatus === "warning"
                      ? "border-orange-200"
                      : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        expiryStatus === "expired"
                          ? "bg-red-50"
                          : expiryStatus === "warning"
                            ? "bg-orange-50"
                            : "bg-gray-50"
                      }`}
                    >
                      <FileText
                        className={`h-5 w-5 ${
                          expiryStatus === "expired"
                            ? "text-red-500"
                            : expiryStatus === "warning"
                              ? "text-orange-500"
                              : "text-gray-400"
                        }`}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                      <p className="text-xs text-gray-500">
                        {doc.category_name} &middot;{" "}
                        {doc.file_size
                          ? `${(doc.file_size / 1024).toFixed(0)} KB`
                          : ""}
                        {doc.mime_type ? ` &middot; ${doc.mime_type}` : ""}
                      </p>
                      {doc.expires_at && (
                        <p
                          className={`text-xs mt-1 flex items-center gap-1 ${
                            expiryStatus === "expired"
                              ? "text-red-600"
                              : expiryStatus === "warning"
                                ? "text-orange-600"
                                : "text-gray-400"
                          }`}
                        >
                          {expiryStatus === "expired" && (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          {expiryStatus === "warning" && (
                            <Clock className="h-3 w-3" />
                          )}
                          {expiryStatus === "expired"
                            ? "Expired"
                            : expiryStatus === "warning"
                              ? "Expiring soon"
                              : "Expires"}{" "}
                          {new Date(doc.expires_at).toLocaleDateString()}
                        </p>
                      )}
                      {doc.verification_status === "rejected" && doc.rejection_reason && (
                        <p className="text-xs text-red-600 mt-1">
                          Rejection reason: {doc.rejection_reason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getVerificationBadge(doc)}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await downloadDocument(doc.id, doc.name);
                          } catch {
                            alert("Failed to download document.");
                          }
                        }}
                        className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                      >
                        Download
                      </button>
                      {(doc.verification_status === "rejected" || isRejected) && (
                        <button
                          onClick={() => setShowUpload(true)}
                          className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                        >
                          Re-upload
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
  );
}
