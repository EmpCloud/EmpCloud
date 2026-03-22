import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "@/api/client";
import {
  FileText,
  Search,
  Upload,
  AlertTriangle,
  CheckCircle,
  Clock,
  X,
} from "lucide-react";

// --- Hooks ---

function useDocuments(params?: { page?: number; user_id?: number; category_id?: number }) {
  return useQuery({
    queryKey: ["documents", params],
    queryFn: () => api.get("/documents", { params }).then((r) => r.data),
  });
}

function useDocCategories() {
  return useQuery({
    queryKey: ["doc-categories"],
    queryFn: () => api.get("/documents/categories").then((r) => r.data.data),
  });
}

function useExpiryAlerts(days = 30) {
  return useQuery({
    queryKey: ["doc-expiry-alerts", days],
    queryFn: () => api.get("/documents/tracking/expiry", { params: { days } }).then((r) => r.data.data),
  });
}

function useMandatoryTracking() {
  return useQuery({
    queryKey: ["doc-mandatory-tracking"],
    queryFn: () => api.get("/documents/tracking/mandatory").then((r) => r.data.data),
  });
}

function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      api.post("/documents/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      }).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

function useVerifyDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; is_verified: boolean; verification_remarks?: string }) =>
      api.put(`/documents/${id}/verify`, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["doc-expiry-alerts"] });
    },
  });
}

function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/documents/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

// --- Component ---

export default function DocumentsPage() {
  const [page, setPage] = useState(1);
  const [searchUserId, setSearchUserId] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [showUpload, setShowUpload] = useState(false);

  const params: Record<string, number> = { page };
  if (searchUserId) params.user_id = Number(searchUserId);
  if (filterCategory) params.category_id = Number(filterCategory);

  const { data: docsData, isLoading } = useDocuments(params);
  const { data: categories } = useDocCategories();
  const { data: expiryAlerts } = useExpiryAlerts();
  const { data: mandatoryData } = useMandatoryTracking();

  const docs = docsData?.data || [];
  const meta = docsData?.meta;
  const missingCount = mandatoryData?.missing?.length || 0;
  const expiringCount = expiryAlerts?.length || 0;

  const uploadDoc = useUploadDocument();
  const verifyDoc = useVerifyDocument();
  const deleteDoc = useDeleteDocument();

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadUserId, setUploadUserId] = useState("");
  const [uploadExpiry, setUploadExpiry] = useState("");

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadCategory) return;

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("category_id", uploadCategory);
    formData.append("name", uploadName || uploadFile.name);
    if (uploadUserId) formData.append("user_id", uploadUserId);
    if (uploadExpiry) formData.append("expires_at", uploadExpiry);

    await uploadDoc.mutateAsync(formData);
    setShowUpload(false);
    setUploadFile(null);
    setUploadName("");
    setUploadCategory("");
    setUploadUserId("");
    setUploadExpiry("");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-gray-500 mt-1">Manage employee documents, track compliance and expiry.</p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Upload className="h-4 w-4" /> Upload Document
        </button>
      </div>

      {/* Alert Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{meta?.total ?? 0}</p>
              <p className="text-sm text-gray-500">Total Documents</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-orange-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">{expiringCount}</p>
              <p className="text-sm text-gray-500">Expiring (30 days)</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{missingCount}</p>
              <p className="text-sm text-gray-500">Missing Mandatory</p>
            </div>
          </div>
        </div>
      </div>

      {/* Expiry Alerts */}
      {expiringCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-orange-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Expiring Documents
          </h3>
          <div className="space-y-1">
            {(expiryAlerts || []).slice(0, 5).map((doc: any) => (
              <p key={doc.id} className="text-sm text-orange-700">
                <span className="font-medium">{doc.user_first_name} {doc.user_last_name}</span>
                {" "}&mdash; {doc.name} ({doc.category_name}) expires{" "}
                {new Date(doc.expires_at).toLocaleDateString()}
              </p>
            ))}
            {expiringCount > 5 && (
              <p className="text-sm text-orange-600 font-medium">
                + {expiringCount - 5} more...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Missing Mandatory */}
      {missingCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Missing Mandatory Documents
          </h3>
          <div className="space-y-1">
            {(mandatoryData?.missing || []).slice(0, 5).map((item: any, i: number) => (
              <p key={i} className="text-sm text-red-700">
                <span className="font-medium">{item.user_name}</span>
                {item.emp_code ? ` (${item.emp_code})` : ""} &mdash; missing{" "}
                <span className="font-medium">{item.category_name}</span>
              </p>
            ))}
            {missingCount > 5 && (
              <p className="text-sm text-red-600 font-medium">
                + {missingCount - 5} more...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Upload Form */}
      {showUpload && (
        <form onSubmit={handleUpload} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Upload Document</h3>
            <button type="button" onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Name</label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Optional — defaults to file name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              >
                <option value="">Select category</option>
                {(categories || []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
              <input
                type="number"
                value={uploadUserId}
                onChange={(e) => setUploadUserId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Leave empty for self"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
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
              <Upload className="h-4 w-4" /> {uploadDoc.isPending ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="number"
            value={searchUserId}
            onChange={(e) => { setSearchUserId(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="Search by employee ID..."
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Categories</option>
          {(categories || []).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Document</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Category</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Expiry</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No documents found</td></tr>
            ) : (
              docs.map((doc: any) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                        <p className="text-xs text-gray-400">{doc.mime_type} &middot; {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {doc.user_first_name} {doc.user_last_name}
                    {doc.user_emp_code && <span className="text-gray-400 ml-1">({doc.user_emp_code})</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{doc.category_name}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {doc.expires_at ? new Date(doc.expires_at).toLocaleDateString() : "--"}
                  </td>
                  <td className="px-6 py-4">
                    {doc.is_verified ? (
                      <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full w-fit">
                        <CheckCircle className="h-3 w-3" /> Verified
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full">Pending</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/v1/documents/${doc.id}/download`}
                        className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                      >
                        Download
                      </a>
                      {!doc.is_verified && (
                        <button
                          onClick={() => verifyDoc.mutate({ id: doc.id, is_verified: true })}
                          className="text-xs text-green-600 hover:text-green-800 font-medium"
                        >
                          Verify
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (window.confirm("Delete this document?")) {
                            deleteDoc.mutate(doc.id);
                          }
                        }}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                      >
                        Delete
                      </button>
                    </div>
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
