import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import {
  ArrowLeft,
  Package,
  PackageCheck,
  UserCheck,
  Calendar,
  MapPin,
  Hash,
  Shield,
  Clock,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Wrench,
  CheckCircle,
  X,
  Loader2,
  Pencil,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  assigned: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  in_repair: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  retired: "bg-muted text-muted-foreground",
  lost: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
  damaged: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
};

const CONDITION_COLORS: Record<string, string> = {
  new: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  good: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300",
  fair: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300",
  poor: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300",
};

const ACTION_COLORS: Record<string, string> = {
  created: "bg-green-500",
  assigned: "bg-blue-500",
  returned: "bg-purple-500",
  sent_to_repair: "bg-yellow-500",
  repaired: "bg-yellow-500",
  retired: "bg-gray-500",
  lost: "bg-red-500",
  found: "bg-green-500",
  damaged: "bg-orange-500",
  updated: "bg-indigo-500",
};

export default function AssetDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [returnCondition, setReturnCondition] = useState("good");
  const [returnNotes, setReturnNotes] = useState("");
  // Edit-asset form state. Initialised from the loaded asset each time the
  // modal opens so unsaved edits don't leak between sessions.
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    serial_number: string;
    brand: string;
    model: string;
    category_id: string;
    purchase_date: string;
    purchase_cost: string;
    warranty_expiry: string;
    condition_status: string;
    location_name: string;
    notes: string;
  }>({
    name: "",
    description: "",
    serial_number: "",
    brand: "",
    model: "",
    category_id: "",
    purchase_date: "",
    purchase_cost: "",
    warranty_expiry: "",
    condition_status: "good",
    location_name: "",
    notes: "",
  });
  const [editError, setEditError] = useState<string | null>(null);
  // History-entry deletion — id being confirmed, or null
  const [historyDeleteId, setHistoryDeleteId] = useState<number | null>(null);
  const [historyDeleteError, setHistoryDeleteError] = useState<string | null>(null);
  // Which in-place confirm dialog is open. Replaces window.confirm() so the
  // Retire and Report Lost flows use a styled modal consistent with the
  // rest of the app.
  const [confirmAction, setConfirmAction] = useState<
    "retire" | "lost" | "found" | "repair_start" | "repair_complete" | null
  >(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const isHR = user && ["hr_admin", "org_admin", "super_admin"].includes(user.role);

  const { data: asset, isLoading } = useQuery({
    queryKey: ["asset", id],
    queryFn: () => api.get(`/assets/${id}`).then((r) => r.data.data),
  });

  const { data: users } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => api.get("/users", { params: { per_page: 100 } }).then((r) => r.data.data),
    enabled: showAssignModal,
  });

  // Categories — loaded only when the edit modal opens so the detail page's
  // initial render stays lean.
  const { data: categories } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: () => api.get("/assets/categories").then((r) => r.data.data),
    enabled: showEditModal,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: object) => api.put(`/assets/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      setShowEditModal(false);
      setEditError(null);
    },
    onError: (err: any) =>
      setEditError(err?.response?.data?.error?.message || t("assetDetail.errors.updateFailed")),
  });

  const deleteHistoryMutation = useMutation({
    mutationFn: (entryId: number) =>
      api.delete(`/assets/${id}/history/${entryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      setHistoryDeleteId(null);
      setHistoryDeleteError(null);
    },
    onError: (err: any) =>
      setHistoryDeleteError(
        err?.response?.data?.error?.message || t("assetDetail.errors.deleteHistoryFailed"),
      ),
  });

  // Prefill the edit form from the current asset, then open the modal. Done
  // lazily rather than as a useEffect so we don't overwrite fields every
  // time the asset query refetches in the background.
  function openEditModal() {
    if (!asset) return;
    setEditForm({
      name: asset.name || "",
      description: asset.description || "",
      serial_number: asset.serial_number || "",
      brand: asset.brand || "",
      model: asset.model || "",
      category_id: asset.category_id ? String(asset.category_id) : "",
      purchase_date: asset.purchase_date
        ? String(asset.purchase_date).slice(0, 10)
        : "",
      purchase_cost:
        asset.purchase_cost != null ? String(asset.purchase_cost) : "",
      warranty_expiry: asset.warranty_expiry
        ? String(asset.warranty_expiry).slice(0, 10)
        : "",
      condition_status: asset.condition_status || "good",
      location_name: asset.location_name || "",
      notes: asset.notes || "",
    });
    setEditError(null);
    setShowEditModal(true);
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (
      editForm.purchase_date &&
      editForm.warranty_expiry &&
      editForm.warranty_expiry < editForm.purchase_date
    ) {
      setEditError(t("assetDetail.errors.warrantyBeforePurchase"));
      return;
    }
    updateMutation.mutate({
      name: editForm.name,
      description: editForm.description || null,
      serial_number: editForm.serial_number || null,
      brand: editForm.brand || null,
      model: editForm.model || null,
      category_id: editForm.category_id ? Number(editForm.category_id) : null,
      purchase_date: editForm.purchase_date || null,
      purchase_cost: editForm.purchase_cost
        ? Number(editForm.purchase_cost)
        : null,
      warranty_expiry: editForm.warranty_expiry || null,
      condition_status: editForm.condition_status,
      location_name: editForm.location_name || null,
      notes: editForm.notes || null,
    });
  }

  const assignMutation = useMutation({
    mutationFn: (data: object) => api.post(`/assets/${id}/assign`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      setShowAssignModal(false);
      setAssignUserId("");
      setAssignNotes("");
    },
  });

  const returnMutation = useMutation({
    mutationFn: (data: object) => api.post(`/assets/${id}/return`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      setShowReturnModal(false);
      setReturnNotes("");
    },
  });

  const retireMutation = useMutation({
    mutationFn: () => api.post(`/assets/${id}/retire`, { notes: "Retired via dashboard" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      setConfirmAction(null);
      setConfirmError(null);
    },
    onError: (err: any) =>
      setConfirmError(err?.response?.data?.error?.message || t("assetDetail.errors.retireFailed")),
  });

  const reportLostMutation = useMutation({
    mutationFn: () => api.post(`/assets/${id}/report-lost`, { notes: "Reported lost via dashboard" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      setConfirmAction(null);
      setConfirmError(null);
    },
    onError: (err: any) =>
      setConfirmError(err?.response?.data?.error?.message || t("assetDetail.errors.reportLostFailed")),
  });

  const markFoundMutation = useMutation({
    mutationFn: () => api.post(`/assets/${id}/mark-found`, { notes: "Marked found via dashboard" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      setConfirmAction(null);
      setConfirmError(null);
    },
    onError: (err: any) =>
      setConfirmError(err?.response?.data?.error?.message || t("assetDetail.errors.markFoundFailed")),
  });

  const sendToRepairMutation = useMutation({
    mutationFn: () =>
      api.post(`/assets/${id}/send-to-repair`, { notes: "Sent for repair via dashboard" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      setConfirmAction(null);
      setConfirmError(null);
    },
    onError: (err: any) =>
      setConfirmError(err?.response?.data?.error?.message || t("assetDetail.errors.sendToRepairFailed")),
  });

  const completeRepairMutation = useMutation({
    mutationFn: () =>
      api.post(`/assets/${id}/complete-repair`, { notes: "Repair completed via dashboard" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      setConfirmAction(null);
      setConfirmError(null);
    },
    onError: (err: any) =>
      setConfirmError(err?.response?.data?.error?.message || t("assetDetail.errors.completeRepairFailed")),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t("assetDetail.loading")}</div>
      </div>
    );
  }

  if (!asset) return null;

  const warrantyExpired = asset.warranty_expiry && new Date(asset.warranty_expiry) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to={isHR ? "/assets" : "/assets/my"} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{asset.asset_tag}</h1>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[asset.status] || "bg-muted"}`}>
              {t(`assetDetail.status.${asset.status}`, { defaultValue: asset.status.replace(/_/g, " ") })}
            </span>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${CONDITION_COLORS[asset.condition_status] || "bg-muted"}`}>
              {t(`assetDetail.condition.${asset.condition_status}`, { defaultValue: asset.condition_status })}
            </span>
          </div>
          <p className="text-muted-foreground mt-1">{asset.name}</p>
        </div>
        {isHR && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={openEditModal}
              className="inline-flex items-center gap-2 px-3 py-2 border border-border text-muted-foreground rounded-lg hover:bg-muted text-sm font-medium"
            >
              <Pencil className="h-4 w-4" />
              {t("assetDetail.buttons.edit")}
            </button>
            {asset.status === "available" && (
              <button
                onClick={() => setShowAssignModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <UserCheck className="h-4 w-4" />
                {t("assetDetail.buttons.assign")}
              </button>
            )}
            {asset.status === "assigned" && (
              <button
                onClick={() => setShowReturnModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
              >
                <RotateCcw className="h-4 w-4" />
                {t("assetDetail.buttons.return")}
              </button>
            )}
            {(asset.status === "available" || asset.status === "assigned") && (
              <button
                onClick={() => {
                  setConfirmAction("repair_start");
                  setConfirmError(null);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 border border-yellow-200 dark:border-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-950/40 text-sm font-medium"
              >
                <Wrench className="h-4 w-4" />
                {t("assetDetail.buttons.sendForRepair")}
              </button>
            )}
            {asset.status === "in_repair" && (
              <button
                onClick={() => {
                  setConfirmAction("repair_complete");
                  setConfirmError(null);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
              >
                <CheckCircle className="h-4 w-4" />
                {t("assetDetail.buttons.repairComplete")}
              </button>
            )}
            {asset.status !== "retired" && asset.status !== "lost" && (
              <>
                <button
                  onClick={() => {
                    setConfirmAction("retire");
                    setConfirmError(null);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-border text-muted-foreground rounded-lg hover:bg-muted text-sm font-medium"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("assetDetail.buttons.retire")}
                </button>
                <button
                  onClick={() => {
                    setConfirmAction("lost");
                    setConfirmError(null);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-sm font-medium"
                >
                  <AlertTriangle className="h-4 w-4" />
                  {t("assetDetail.buttons.reportLost")}
                </button>
              </>
            )}
            {asset.status === "lost" && (
              <button
                onClick={() => {
                  setConfirmAction("found");
                  setConfirmError(null);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
              >
                <PackageCheck className="h-4 w-4" />
                {t("assetDetail.buttons.markFound")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Asset Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">{t("assetDetail.info.heading")}</h2>
            <div className="grid grid-cols-2 gap-y-4 gap-x-8">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("assetDetail.info.assetTag")}</p>
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">{asset.asset_tag}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("assetDetail.info.category")}</p>
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-foreground">{asset.category_name || t("assetDetail.info.uncategorized")}</p>
                </div>
              </div>
              {asset.serial_number && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("assetDetail.info.serialNumber")}</p>
                  <p className="text-sm text-foreground">{asset.serial_number}</p>
                </div>
              )}
              {asset.brand && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("assetDetail.info.brand")}</p>
                  <p className="text-sm text-foreground">{asset.brand}</p>
                </div>
              )}
              {asset.model && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("assetDetail.info.model")}</p>
                  <p className="text-sm text-foreground">{asset.model}</p>
                </div>
              )}
              {asset.location_name && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("assetDetail.info.location")}</p>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-foreground">{asset.location_name}</p>
                  </div>
                </div>
              )}
              {asset.purchase_date && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("assetDetail.info.purchaseDate")}</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-foreground">{new Date(asset.purchase_date).toLocaleDateString()}</p>
                  </div>
                </div>
              )}
              {asset.purchase_cost != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("assetDetail.info.purchaseCost")}</p>
                  <p className="text-sm text-foreground">
                    {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
                      Number(asset.purchase_cost) / 100,
                    )}
                  </p>
                </div>
              )}
              {asset.warranty_expiry && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("assetDetail.info.warrantyExpiry")}</p>
                  <div className="flex items-center gap-2">
                    <Shield className={`h-4 w-4 ${warrantyExpired ? "text-red-500" : "text-green-500"}`} />
                    <p className={`text-sm ${warrantyExpired ? "text-red-600 dark:text-red-400 font-medium" : "text-foreground"}`}>
                      {new Date(asset.warranty_expiry).toLocaleDateString()}
                      {warrantyExpired && t("assetDetail.info.expiredSuffix")}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {asset.description && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1">{t("assetDetail.info.description")}</p>
                <p className="text-sm text-muted-foreground">{asset.description}</p>
              </div>
            )}
            {asset.notes && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1">{t("assetDetail.info.notes")}</p>
                <p className="text-sm text-muted-foreground">{asset.notes}</p>
              </div>
            )}
          </div>

          {/* Assignment Info */}
          {asset.status === "assigned" && (
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">{t("assetDetail.assignment.heading")}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">{t("assetDetail.assignment.assignedTo")}</p>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">{asset.assigned_to_name}</p>
                </div>
                {asset.assigned_at && (
                  <div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">{t("assetDetail.assignment.assignedAt")}</p>
                    <p className="text-sm text-blue-900 dark:text-blue-100">{new Date(asset.assigned_at).toLocaleString()}</p>
                  </div>
                )}
                {asset.assigned_by_name && (
                  <div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">{t("assetDetail.assignment.assignedBy")}</p>
                    <p className="text-sm text-blue-900 dark:text-blue-100">{asset.assigned_by_name}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* History Timeline */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">{t("assetDetail.history.heading")}</h2>
          </div>
          {asset.history && asset.history.length > 0 ? (
            <div className="relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-muted" />
              <div className="space-y-4">
                {asset.history.map((entry: any) => (
                  <div key={entry.id} className="relative pl-6 group">
                    <div className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-card ${ACTION_COLORS[entry.action] || "bg-gray-400"}`} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground capitalize">{t(`assetDetail.action.${entry.action}`, { defaultValue: entry.action })}</p>
                        {entry.to_user_name && (
                          <p className="text-xs text-muted-foreground">{t("assetDetail.history.to", { name: entry.to_user_name })}</p>
                        )}
                        {entry.from_user_name && (
                          <p className="text-xs text-muted-foreground">{t("assetDetail.history.from", { name: entry.from_user_name })}</p>
                        )}
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{entry.notes}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {entry.performed_by_name} &middot; {new Date(entry.created_at).toLocaleString()}
                        </p>
                      </div>
                      {isHR && (
                        // #1535 — Button was previously opacity-0 group-hover:opacity-100,
                        // making it invisible until hover and completely unreachable on
                        // touch devices. Reporter assumed there was no way to delete
                        // history entries. Now always visible for HR admins, with a
                        // subtle default color that emphasizes on hover.
                        <button
                          onClick={() => {
                            setHistoryDeleteId(entry.id);
                            setHistoryDeleteError(null);
                          }}
                          title={t("assetDetail.history.deleteTitle")}
                          aria-label={t("assetDetail.history.deleteTitle")}
                          className="p-1 rounded text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("assetDetail.history.empty")}</p>
          )}
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">{t("assetDetail.assignModal.title")}</h2>
              <button onClick={() => setShowAssignModal(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                assignMutation.mutate({
                  assigned_to: Number(assignUserId),
                  notes: assignNotes || null,
                });
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.assignModal.assignToLabel")}</label>
                <select
                  required
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">{t("assetDetail.assignModal.selectEmployee")}</option>
                  {(users || []).map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name} {u.last_name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.assignModal.notesLabel")}</label>
                <textarea
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  rows={2}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted"
                >
                  {t("assetDetail.assignModal.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={assignMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {assignMutation.isPending ? t("assetDetail.assignModal.submitting") : t("assetDetail.assignModal.submit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">{t("assetDetail.returnModal.title")}</h2>
              <button onClick={() => setShowReturnModal(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                returnMutation.mutate({
                  condition: returnCondition,
                  notes: returnNotes || null,
                });
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.returnModal.conditionLabel")}</label>
                <select
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="new">{t("assetDetail.conditionOptions.new")}</option>
                  <option value="good">{t("assetDetail.conditionOptions.good")}</option>
                  <option value="fair">{t("assetDetail.conditionOptions.fair")}</option>
                  <option value="poor">{t("assetDetail.conditionOptions.poor")}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.returnModal.notesLabel")}</label>
                <textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  rows={2}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted"
                >
                  {t("assetDetail.returnModal.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={returnMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {returnMutation.isPending ? t("assetDetail.returnModal.submitting") : t("assetDetail.returnModal.submit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation dialog — styled replacement for Retire / Report Lost / Mark Found / Repair */}
      {confirmAction && (() => {
        const CONFIG = {
          retire: {
            mutation: retireMutation,
            title: t("assetDetail.confirm.retire.title"),
            body: t("assetDetail.confirm.retire.body"),
            confirmLabel: t("assetDetail.confirm.retire.confirmLabel"),
            iconColor: "text-muted-foreground bg-muted",
            confirmBtn: "bg-gray-900 hover:bg-black",
            Icon: Trash2,
          },
          lost: {
            mutation: reportLostMutation,
            title: t("assetDetail.confirm.lost.title"),
            body: t("assetDetail.confirm.lost.body"),
            confirmLabel: t("assetDetail.confirm.lost.confirmLabel"),
            iconColor: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40",
            confirmBtn: "bg-red-600 hover:bg-red-700",
            Icon: AlertTriangle,
          },
          found: {
            mutation: markFoundMutation,
            title: t("assetDetail.confirm.found.title"),
            body: t("assetDetail.confirm.found.body"),
            confirmLabel: t("assetDetail.confirm.found.confirmLabel"),
            iconColor: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40",
            confirmBtn: "bg-green-600 hover:bg-green-700",
            Icon: PackageCheck,
          },
          repair_start: {
            mutation: sendToRepairMutation,
            title: t("assetDetail.confirm.repairStart.title"),
            body:
              asset.status === "assigned"
                ? t("assetDetail.confirm.repairStart.bodyAssigned")
                : t("assetDetail.confirm.repairStart.bodyDefault"),
            confirmLabel: t("assetDetail.confirm.repairStart.confirmLabel"),
            iconColor: "text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40",
            confirmBtn: "bg-yellow-600 hover:bg-yellow-700",
            Icon: Wrench,
          },
          repair_complete: {
            mutation: completeRepairMutation,
            title: t("assetDetail.confirm.repairComplete.title"),
            body: t("assetDetail.confirm.repairComplete.body"),
            confirmLabel: t("assetDetail.confirm.repairComplete.confirmLabel"),
            iconColor: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40",
            confirmBtn: "bg-green-600 hover:bg-green-700",
            Icon: CheckCircle,
          },
        } as const;

        const cfg = CONFIG[confirmAction];
        const pending = cfg.mutation.isPending;
        const run = () => cfg.mutation.mutate();
        const { title, body, confirmLabel, iconColor, confirmBtn, Icon } = cfg;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !pending && setConfirmAction(null)}
          >
            <div
              className="w-full max-w-md rounded-xl bg-card shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${iconColor}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className="font-medium text-muted-foreground">
                        {asset.asset_tag} — {asset.name}
                      </span>
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                  </div>
                </div>
              </div>
              {confirmError && (
                <div className="mx-6 mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                  {confirmError}
                </div>
              )}
              <div className="flex justify-end gap-3 rounded-b-xl border-t border-border bg-muted px-6 py-4">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  disabled={pending}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-card disabled:opacity-50"
                >
                  {t("assetDetail.confirm.cancel")}
                </button>
                <button
                  type="button"
                  onClick={run}
                  disabled={pending}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${confirmBtn}`}
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> {t("assetDetail.confirm.working")}
                    </>
                  ) : (
                    confirmLabel
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Asset Modal */}
      {showEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !updateMutation.isPending && setShowEditModal(false)}
        >
          <div
            className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">{t("assetDetail.editModal.title")}</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={submitEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.editModal.nameLabel")}</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.editModal.categoryLabel")}</label>
                  <select
                    value={editForm.category_id}
                    onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">{t("assetDetail.editModal.uncategorized")}</option>
                    {(categories || []).map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.editModal.serialNumberLabel")}</label>
                  <input
                    type="text"
                    value={editForm.serial_number}
                    onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.editModal.brandLabel")}</label>
                  <input
                    type="text"
                    value={editForm.brand}
                    onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.editModal.modelLabel")}</label>
                  <input
                    type="text"
                    value={editForm.model}
                    onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.editModal.conditionLabel")}</label>
                  <select
                    value={editForm.condition_status}
                    onChange={(e) =>
                      setEditForm({ ...editForm, condition_status: e.target.value })
                    }
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="new">{t("assetDetail.conditionOptions.new")}</option>
                    <option value="good">{t("assetDetail.conditionOptions.good")}</option>
                    <option value="fair">{t("assetDetail.conditionOptions.fair")}</option>
                    <option value="poor">{t("assetDetail.conditionOptions.poor")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.editModal.purchaseDateLabel")}</label>
                  <input
                    type="date"
                    value={editForm.purchase_date}
                    onChange={(e) => setEditForm({ ...editForm, purchase_date: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.editModal.purchaseCostLabel")}</label>
                  <div className="flex items-stretch">
                    <span className="inline-flex items-center px-3 py-2 rounded-l-lg border border-r-0 border-border bg-muted text-sm text-muted-foreground">
                      ₹ INR
                    </span>
                    <input
                      type="number"
                      value={editForm.purchase_cost}
                      onChange={(e) =>
                        setEditForm({ ...editForm, purchase_cost: e.target.value })
                      }
                      className="bg-card text-foreground flex-1 min-w-0 px-3 py-2 border border-border rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{t("assetDetail.editModal.purchaseCostHint")}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.editModal.warrantyExpiryLabel")}</label>
                  <input
                    type="date"
                    value={editForm.warranty_expiry}
                    onChange={(e) => setEditForm({ ...editForm, warranty_expiry: e.target.value })}
                    min={editForm.purchase_date || undefined}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.editModal.locationLabel")}</label>
                  <input
                    type="text"
                    value={editForm.location_name}
                    onChange={(e) => setEditForm({ ...editForm, location_name: e.target.value })}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.editModal.descriptionLabel")}</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={2}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">{t("assetDetail.editModal.notesLabel")}</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={2}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              {editError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">{editError}</div>
              )}
              <div className="flex justify-end gap-3 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted disabled:opacity-50"
                >
                  {t("assetDetail.editModal.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> {t("assetDetail.editModal.saving")}
                    </>
                  ) : (
                    t("assetDetail.editModal.save")
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete History Entry confirmation */}
      {historyDeleteId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteHistoryMutation.isPending && setHistoryDeleteId(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">{t("assetDetail.deleteHistory.title")}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("assetDetail.deleteHistory.body")}
                  </p>
                </div>
              </div>
            </div>
            {historyDeleteError && (
              <div className="mx-6 mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                {historyDeleteError}
              </div>
            )}
            <div className="flex justify-end gap-3 rounded-b-xl border-t border-border bg-muted px-6 py-4">
              <button
                type="button"
                onClick={() => setHistoryDeleteId(null)}
                disabled={deleteHistoryMutation.isPending}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-card disabled:opacity-50"
              >
                {t("assetDetail.deleteHistory.cancel")}
              </button>
              <button
                type="button"
                onClick={() => deleteHistoryMutation.mutate(historyDeleteId)}
                disabled={deleteHistoryMutation.isPending}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deleteHistoryMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("assetDetail.deleteHistory.deleting")}
                  </>
                ) : (
                  t("assetDetail.deleteHistory.confirm")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
