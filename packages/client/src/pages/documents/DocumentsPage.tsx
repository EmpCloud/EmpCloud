import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import {
  FileText,
  Search,
  Upload,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  X,
  Users,
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

function useRejectDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rejection_reason }: { id: number; rejection_reason: string }) =>
      api.post(`/documents/${id}/reject`, { rejection_reason }).then((r) => r.data.data),
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

type DocTab = "all" | "expiring" | "mandatory";

const HR_ROLES = ["hr_admin", "hr_manager", "org_admin", "super_admin"];

export default function DocumentsPage() {
  const user = useAuthStore((s) => s.user);
  const isHR = user && HR_ROLES.includes(user.role);

  // Employees should only see their own documents via /documents/my
  if (!isHR) {
    return <Navigate to="/documents/my" replace />;
  }

  const [page, setPage] = useState(1);
  const [searchUserId, setSearchUserId] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<DocTab>("all");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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
  const rejectDoc = useRejectDocument();
  const deleteDoc = useDeleteDocument();

  // Fetch users for employee dropdown
  const [employeeSearch, setEmployeeSearch] = useState("");
  const { data: employeeList } = useQuery({
    queryKey: ["users-list-docs", employeeSearch],
    queryFn: () =>
      api
        .get("/users", { params: { per_page: 50, ...(employeeSearch && { search: employeeSearch }) } })
        .then((r) => r.data.data),
    enabled: showUpload,
  });

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
    setEmployeeSearch("");
  };

  const handleDownload = useCallback(async (docId: number, docName: string) => {
    try {
      const response = await api.get(`/documents/${docId}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", docName || "document");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download document.");
    }
  }, []);

  const handleReject = (docId: number) => {
    if (!rejectReason.trim()) return;
    rejectDoc.mutate(
      { id: docId, rejection_reason: rejectReason },
      {
        onSuccess: () => {
          setRejectingId(null);
          setRejectReason("");
        },
      },
    );
  };

  const getExpiryClass = (expiresAt: string | null) => {
    if (!expiresAt) return "";
    const now = new Date();
    const expiry = new Date(expiresAt);
    if (expiry < now) return "text-red-600 font-medium";
    const daysUntil = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntil <= 30) return "text-orange-600 font-medium";
    return "text-gray-500";
  };

  const getStatusBadge = (doc: any) => {
    const status = doc.verification_status || (doc.is_verified ? "verified" : "pending");
    if (status === "verified" || doc.is_verified) {
      return (
        <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full w-fit">
          <CheckCircle className="h-3 w-3" /> Verified
        </span>
      );
    }
    if (status === "rejected") {
      return (
        <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded-full w-fit">
          <XCircle className="h-3 w-3" /> Rejected
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full w-fit">
        <Clock className="h-3 w-3" /> Pending
      </span>
    );
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
        <button onClick={() => setActiveTab("all")} className={`bg-white rounded-xl border p-5 text-left transition ${activeTab === "all" ? "border-brand-300 ring-1 ring-brand-200" : "border-gray-200"}`}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{meta?.total ?? 0}</p>
              <p className="text-sm text-gray-500">Total Documents</p>
            </div>
          </div>
        </button>
        <button onClick={() => setActiveTab("expiring")} className={`bg-white rounded-xl border p-5 text-left transition ${activeTab === "expiring" ? "border-orange-300 ring-1 ring-orange-200" : "border-orange-200"}`}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">{expiringCount}</p>
              <p className="text-sm text-gray-500">Expiring (30 days)</p>
            </div>
          </div>
        </button>
        <button onClick={() => setActiveTab("mandatory")} className={`bg-white rounded-xl border p-5 text-left transition ${activeTab === "mandatory" ? "border-red-300 ring-1 ring-red-200" : "border-red-200"}`}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{missingCount}</p>
              <p className="text-sm text-gray-500">Missing Mandatory</p>
            </div>
          </div>
        </button>
      </div>

      {/* Reject Modal */}
      {rejectingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Reject Document</h3>
              <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                rows={3}
                placeholder="Please provide a reason for rejection..."
                required
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => handleReject(rejectingId)}
                disabled={rejectDoc.isPending || !rejectReason.trim()}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {rejectDoc.isPending ? "Rejecting..." : "Reject Document"}
              </button>
            </div>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <div className="relative">
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(e) => { setEmployeeSearch(e.target.value); if (!e.target.value) setUploadUserId(""); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Search by name or email (leave empty for self)"
                />
                {employeeSearch && employeeList && employeeList.length > 0 && !uploadUserId && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {employeeList.map((u: any) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setUploadUserId(String(u.id));
                          setEmployeeSearch(`${u.first_name} ${u.last_name} (${u.email})`);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
                        <span className="font-medium text-gray-900">{u.first_name} {u.last_name}</span>
                        <span className="text-gray-500 ml-2">{u.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {uploadUserId && (
                  <button
                    type="button"
                    onClick={() => { setUploadUserId(""); setEmployeeSearch(""); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
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
          {uploadDoc.isError && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {(uploadDoc.error as any)?.response?.data?.error?.message || "Failed to upload document. Please try again."}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={uploadDoc.isPending || !uploadFile || !uploadCategory}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" /> {uploadDoc.isPending ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      )}

      {/* Tab: Expiring Documents */}
      {activeTab === "expiring" && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" /> Documents Expiring Within 30 Days
          </h3>
          {expiringCount === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              No documents expiring soon.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Document</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Category</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Expires</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(expiryAlerts || []).map((doc: any) => {
                    const isExpired = new Date(doc.expires_at) < new Date();
                    return (
                      <tr key={doc.id} className={isExpired ? "bg-red-50/50" : "bg-orange-50/30"}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileText className={`h-5 w-5 ${isExpired ? "text-red-400" : "text-orange-400"}`} />
                            <span className="text-sm font-medium text-gray-900">{doc.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {doc.user_first_name} {doc.user_last_name}
                          {doc.user_emp_code && <span className="text-gray-400 ml-1">({doc.user_emp_code})</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{doc.category_name}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-sm font-medium ${isExpired ? "text-red-600" : "text-orange-600"}`}>
                            {isExpired ? "EXPIRED " : ""}{new Date(doc.expires_at).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {doc.is_verified ? (
                            <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full">Verified</span>
                          ) : (
                            <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full">Pending</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Missing Mandatory */}
      {activeTab === "mandatory" && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-red-500" /> Missing Mandatory Documents
          </h3>
          {missingCount === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              All employees have submitted mandatory documents.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee Code</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Missing Document</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(mandatoryData?.missing || []).map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.user_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{item.emp_code || "--"}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-full font-medium">{item.category_name}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: All Documents */}
      {activeTab === "all" && (
        <>
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
                min={1}
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
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
            <table className="min-w-full">
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
                      <td className="px-6 py-4">
                        <span className={`text-sm ${getExpiryClass(doc.expires_at)}`}>
                          {doc.expires_at ? new Date(doc.expires_at).toLocaleDateString() : "--"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(doc)}
                        {doc.verification_status === "rejected" && doc.rejection_reason && (
                          <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={doc.rejection_reason}>
                            {doc.rejection_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownload(doc.id, doc.name)}
                            className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                          >
                            Download
                          </button>
                          {isHR && !doc.is_verified && doc.verification_status !== "rejected" && (
                            <>
                              <button
                                onClick={() => verifyDoc.mutate({ id: doc.id, is_verified: true })}
                                className="text-xs text-green-600 hover:text-green-800 font-medium"
                              >
                                Verify
                              </button>
                              <button
                                onClick={() => setRejectingId(doc.id)}
                                className="text-xs text-red-600 hover:text-red-800 font-medium"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {isHR && doc.verification_status === "rejected" && (
                            <button
                              onClick={() => verifyDoc.mutate({ id: doc.id, is_verified: true })}
                              className="text-xs text-green-600 hover:text-green-800 font-medium"
                            >
                              Verify
                            </button>
                          )}
                          {isHR && (
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
                          )}
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
        </>
      )}
    </div>
  );
}
