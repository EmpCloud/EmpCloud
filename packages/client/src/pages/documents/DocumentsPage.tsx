import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import { showToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// --- Hooks ---

function useDocuments(params?: { page?: number; user_id?: number; category_id?: number; search?: string }) {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["doc-categories"] });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["doc-categories"] });
    },
  });
}

// --- Component ---

type DocTab = "all" | "expiring" | "mandatory";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

export default function DocumentsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isHR = user && HR_ROLES.includes(user.role);

  // Employees should only see their own documents via /documents/my
  if (!isHR) {
    return <Navigate to="/documents/my" replace />;
  }

  const [page, setPage] = useState(1);
  const [searchUserId] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<DocTab>("all");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // Confirm-delete dialog state (replaces window.confirm for deleting a document).
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null);

  const params: Record<string, number | string> = { page };
  if (searchUserId) params.user_id = Number(searchUserId);
  if (searchText) params.search = searchText;
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
    uploadDoc.reset();
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
      showToast("error", t("documents.page.downloadFailed"));
    }
  }, [t]);

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
    if (expiry < now) return "text-red-600 dark:text-red-400 font-medium";
    const daysUntil = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntil <= 30) return "text-orange-600 dark:text-orange-400 font-medium";
    return "text-muted-foreground";
  };

  const getStatusBadge = (doc: any) => {
    const status = doc.verification_status || (doc.is_verified ? "verified" : "pending");
    if (status === "verified" || doc.is_verified) {
      return (
        <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 px-2 py-1 rounded-full w-fit">
          <CheckCircle className="h-3 w-3" /> {t("documents.page.verified")}
        </span>
      );
    }
    if (status === "rejected") {
      return (
        <span className="flex items-center gap-1 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-2 py-1 rounded-full w-fit">
          <XCircle className="h-3 w-3" /> {t("documents.page.rejected")}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-full w-fit">
        <Clock className="h-3 w-3" /> {t("documents.page.pending")}
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("documents.page.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("documents.page.subtitle")}</p>
        </div>
        <button
          onClick={() => {
            setShowUpload(!showUpload);
            // Clear previous upload error/warning when toggling the form
            if (showUpload) {
              uploadDoc.reset();
              setUploadFile(null);
              setUploadName("");
              setUploadCategory("");
              setUploadUserId("");
              setUploadExpiry("");
              setEmployeeSearch("");
            }
          }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Upload className="h-4 w-4" /> {t("documents.page.uploadDocument")}
        </button>
      </div>

      {/* Missing-mandatory banner — surface compliance gap without making admins hunt for it.
          Shown only when there are outstanding mandatory-doc requirements and the user is not
          already looking at the mandatory tab (so it acts as a CTA, not a redundant header). */}
      {missingCount > 0 && activeTab !== "mandatory" && (
        <div className="mb-6 bg-red-50 dark:bg-red-950/40 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">
              {t("documents.page.mandatoryOutstanding", { count: missingCount })}
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
              {t("documents.page.mandatoryOutstandingHint")}
            </p>
          </div>
          <button
            onClick={() => setActiveTab("mandatory")}
            className="text-xs font-medium text-red-700 dark:text-red-300 hover:text-red-900 underline shrink-0"
          >
            {t("documents.page.reviewNow")}
          </button>
        </div>
      )}

      {/* Alert Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button onClick={() => setActiveTab("all")} className={`bg-card rounded-xl border p-5 text-left transition ${activeTab === "all" ? "border-brand-300 ring-1 ring-brand-200" : "border-border"}`}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{meta?.total ?? 0}</p>
              <p className="text-sm text-muted-foreground">{t("documents.page.totalDocuments")}</p>
            </div>
          </div>
        </button>
        <button onClick={() => setActiveTab("expiring")} className={`bg-card rounded-xl border p-5 text-left transition ${activeTab === "expiring" ? "border-orange-300 ring-1 ring-orange-200" : "border-orange-200"}`}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center">
              <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{expiringCount}</p>
              <p className="text-sm text-muted-foreground">{t("documents.page.expiring30")}</p>
            </div>
          </div>
        </button>
        <button onClick={() => setActiveTab("mandatory")} className={`bg-card rounded-xl border p-5 text-left transition ${activeTab === "mandatory" ? "border-red-300 ring-1 ring-red-200" : "border-red-200"}`}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{missingCount}</p>
              <p className="text-sm text-muted-foreground">{t("documents.page.missingMandatory")}</p>
            </div>
          </div>
        </button>
      </div>

      {/* Reject Modal */}
      {rejectingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">{t("documents.page.rejectTitle")}</h3>
              <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="text-muted-foreground hover:text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("documents.page.rejectionReason")} *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
                rows={3}
                placeholder={t("documents.page.rejectionPlaceholder")}
                required
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="bg-card text-foreground px-4 py-2 text-sm border border-border rounded-lg">
                {t("documents.page.cancel")}
              </button>
              <button
                onClick={() => handleReject(rejectingId)}
                disabled={rejectDoc.isPending || !rejectReason.trim()}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {rejectDoc.isPending ? t("documents.page.rejecting") : t("documents.page.rejectDocument")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Form */}
      {showUpload && (
        <form onSubmit={handleUpload} className="bg-card rounded-xl border border-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">{t("documents.page.uploadDocument")}</h3>
            <button type="button" onClick={() => setShowUpload(false)} className="text-muted-foreground hover:text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("documents.page.fieldFile")} *</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("documents.page.fieldDocName")}</label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
                placeholder={t("documents.page.docNamePlaceholder")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("documents.page.fieldCategory")} *</label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
                required
              >
                <option value="">{t("documents.page.selectCategory")}</option>
                {(categories || []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("documents.page.fieldEmployee")}</label>
              <div className="relative">
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(e) => { setEmployeeSearch(e.target.value); if (!e.target.value) setUploadUserId(""); }}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
                  placeholder={t("documents.page.employeePlaceholder")}
                />
                {employeeSearch && employeeList && employeeList.length > 0 && !uploadUserId && (
                  <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {employeeList.map((u: any) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setUploadUserId(String(u.id));
                          setEmployeeSearch(`${u.first_name} ${u.last_name} (${u.email})`);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b border-border last:border-0"
                      >
                        <span className="font-medium text-foreground">{u.first_name} {u.last_name}</span>
                        <span className="text-muted-foreground ml-2">{u.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {uploadUserId && (
                  <button
                    type="button"
                    onClick={() => { setUploadUserId(""); setEmployeeSearch(""); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{t("documents.page.fieldExpiry")}</label>
              <input
                type="date"
                value={uploadExpiry}
                onChange={(e) => setUploadExpiry(e.target.value)}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
          </div>
          {uploadDoc.isError && (
            <div className="mt-4 bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 dark:text-red-300 text-sm rounded-lg px-4 py-3">
              {(uploadDoc.error as any)?.response?.data?.error?.message || t("documents.page.uploadFailed")}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={uploadDoc.isPending || !uploadFile || !uploadCategory}
              className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" /> {uploadDoc.isPending ? t("documents.page.uploading") : t("documents.page.upload")}
            </button>
          </div>
        </form>
      )}

      {/* Tab: Expiring Documents */}
      {activeTab === "expiring" && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" /> {t("documents.page.expiringHeading")}
          </h3>
          {expiringCount === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
              {t("documents.page.noExpiring")}
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colDocument")}</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colEmployee")}</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colCategory")}</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colExpires")}</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colStatus")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(expiryAlerts || []).map((doc: any) => {
                    const isExpired = new Date(doc.expires_at) < new Date();
                    return (
                      <tr key={doc.id} className={isExpired ? "bg-red-50/50" : "bg-orange-50/30"}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileText className={`h-5 w-5 ${isExpired ? "text-red-400" : "text-orange-400"}`} />
                            <span className="text-sm font-medium text-foreground">{doc.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {doc.user_first_name} {doc.user_last_name}
                          {doc.user_emp_code && <span className="text-muted-foreground ml-1">({doc.user_emp_code})</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">{doc.category_name}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-sm font-medium ${isExpired ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"}`}>
                            {isExpired ? t("documents.page.expiredPrefix") + " " : ""}{new Date(doc.expires_at).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {doc.is_verified ? (
                            <span className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 px-2 py-1 rounded-full">{t("documents.page.verified")}</span>
                          ) : (
                            <span className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-full">{t("documents.page.pending")}</span>
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
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-red-500" /> {t("documents.page.missingHeading")}
          </h3>
          {missingCount === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
              {t("documents.page.allSubmitted")}
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colEmployee")}</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colEmployeeCode")}</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colMissingDocument")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(mandatoryData?.missing || []).map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-muted">
                      <td className="px-6 py-4 text-sm font-medium text-foreground">{item.user_name}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{item.emp_code || "--"}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-2 py-1 rounded-full font-medium">{item.category_name}</span>
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
                className="bg-card text-foreground w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm"
                placeholder={t("documents.page.searchPlaceholder")}
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
              className="bg-card text-foreground px-3 py-2 border border-border rounded-lg text-sm"
            >
              <option value="">{t("documents.page.allCategories")}</option>
              {(categories || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Documents Table */}
          <div className="bg-card rounded-xl border border-border overflow-x-auto -mx-4 lg:mx-0">
            <table className="min-w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colDocument")}</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colEmployee")}</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colCategory")}</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colExpiry")}</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colStatus")}</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase px-6 py-3">{t("documents.page.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">{t("documents.page.loading")}</td></tr>
                ) : docs.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">{t("documents.page.noDocuments")}</td></tr>
                ) : (
                  docs.map((doc: any) => (
                    <tr key={doc.id} className="hover:bg-muted">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">{doc.mime_type} &middot; {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {doc.user_first_name} {doc.user_last_name}
                        {doc.user_emp_code && <span className="text-muted-foreground ml-1">({doc.user_emp_code})</span>}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">{doc.category_name}</span>
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
                            className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-800 font-medium"
                          >
                            {t("documents.page.download")}
                          </button>
                          {isHR && !doc.is_verified && doc.verification_status !== "rejected" && (
                            <>
                              <button
                                onClick={() => verifyDoc.mutate({ id: doc.id, is_verified: true })}
                                className="text-xs text-green-600 dark:text-green-400 hover:text-green-800 font-medium"
                              >
                                {t("documents.page.verify")}
                              </button>
                              <button
                                onClick={() => setRejectingId(doc.id)}
                                className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 font-medium"
                              >
                                {t("documents.page.reject")}
                              </button>
                            </>
                          )}
                          {isHR && doc.verification_status === "rejected" && (
                            <button
                              onClick={() => verifyDoc.mutate({ id: doc.id, is_verified: true })}
                              className="text-xs text-green-600 dark:text-green-400 hover:text-green-800 font-medium"
                            >
                              {t("documents.page.verify")}
                            </button>
                          )}
                          {isHR && (
                            <button
                              onClick={() => setDeleteDocId(doc.id)}
                              className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 font-medium"
                            >
                              {t("documents.page.delete")}
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
              <div className="flex items-center justify-between px-6 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  {t("documents.page.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="bg-card text-foreground px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50"
                  >
                    {t("documents.page.previous")}
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= meta.total_pages}
                    className="bg-card text-foreground px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50"
                  >
                    {t("documents.page.next")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteDocId !== null}
        title={t("documents.page.deleteTitle")}
        description={t("documents.page.deleteDesc")}
        confirmText={t("documents.page.delete")}
        variant="danger"
        loading={deleteDoc.isPending}
        onConfirm={() => {
          if (deleteDocId !== null) {
            deleteDoc.mutate(deleteDocId, {
              onSuccess: () => setDeleteDocId(null),
            });
          }
        }}
        onCancel={() => setDeleteDocId(null)}
      />
    </div>
  );
}
