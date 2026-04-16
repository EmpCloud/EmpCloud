import { useState } from "react";
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
  available: "bg-green-100 text-green-700",
  assigned: "bg-blue-100 text-blue-700",
  in_repair: "bg-yellow-100 text-yellow-700",
  retired: "bg-gray-100 text-gray-600",
  lost: "bg-red-100 text-red-700",
  damaged: "bg-orange-100 text-orange-700",
};

const CONDITION_COLORS: Record<string, string> = {
  new: "bg-emerald-100 text-emerald-700",
  good: "bg-green-100 text-green-700",
  fair: "bg-yellow-100 text-yellow-700",
  poor: "bg-red-100 text-red-700",
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
      setEditError(err?.response?.data?.error?.message || "Failed to update asset"),
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
        err?.response?.data?.error?.message || "Failed to delete history entry",
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
      setEditError("Warranty expiry cannot be before the purchase date.");
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
      setConfirmError(err?.response?.data?.error?.message || "Failed to retire asset"),
  });

  const reportLostMutation = useMutation({
    mutationFn: () => api.post(`/assets/${id}/report-lost`, { notes: "Reported lost via dashboard" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      setConfirmAction(null);
      setConfirmError(null);
    },
    onError: (err: any) =>
      setConfirmError(err?.response?.data?.error?.message || "Failed to report asset as lost"),
  });

  const markFoundMutation = useMutation({
    mutationFn: () => api.post(`/assets/${id}/mark-found`, { notes: "Marked found via dashboard" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      setConfirmAction(null);
      setConfirmError(null);
    },
    onError: (err: any) =>
      setConfirmError(err?.response?.data?.error?.message || "Failed to mark asset as found"),
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
      setConfirmError(err?.response?.data?.error?.message || "Failed to send asset to repair"),
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
      setConfirmError(err?.response?.data?.error?.message || "Failed to complete repair"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading asset details...</div>
      </div>
    );
  }

  if (!asset) return null;

  const warrantyExpired = asset.warranty_expiry && new Date(asset.warranty_expiry) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to={isHR ? "/assets" : "/assets/my"} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{asset.asset_tag}</h1>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[asset.status] || "bg-gray-100"}`}>
              {asset.status.replace(/_/g, " ")}
            </span>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${CONDITION_COLORS[asset.condition_status] || "bg-gray-100"}`}>
              {asset.condition_status}
            </span>
          </div>
          <p className="text-gray-500 mt-1">{asset.name}</p>
        </div>
        {isHR && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={openEditModal}
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
            {asset.status === "available" && (
              <button
                onClick={() => setShowAssignModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <UserCheck className="h-4 w-4" />
                Assign
              </button>
            )}
            {asset.status === "assigned" && (
              <button
                onClick={() => setShowReturnModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
              >
                <RotateCcw className="h-4 w-4" />
                Return
              </button>
            )}
            {(asset.status === "available" || asset.status === "assigned") && (
              <button
                onClick={() => {
                  setConfirmAction("repair_start");
                  setConfirmError(null);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 border border-yellow-200 text-yellow-700 rounded-lg hover:bg-yellow-50 text-sm font-medium"
              >
                <Wrench className="h-4 w-4" />
                Send for Repair
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
                Repair Complete
              </button>
            )}
            {asset.status !== "retired" && asset.status !== "lost" && (
              <>
                <button
                  onClick={() => {
                    setConfirmAction("retire");
                    setConfirmError(null);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  <Trash2 className="h-4 w-4" />
                  Retire
                </button>
                <button
                  onClick={() => {
                    setConfirmAction("lost");
                    setConfirmError(null);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Report Lost
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
                Mark Found
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Asset Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Asset Information</h2>
            <div className="grid grid-cols-2 gap-y-4 gap-x-8">
              <div>
                <p className="text-xs text-gray-500 mb-1">Asset Tag</p>
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-gray-400" />
                  <p className="text-sm font-medium text-gray-900">{asset.asset_tag}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Category</p>
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-gray-400" />
                  <p className="text-sm text-gray-900">{asset.category_name || "Uncategorized"}</p>
                </div>
              </div>
              {asset.serial_number && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Serial Number</p>
                  <p className="text-sm text-gray-900">{asset.serial_number}</p>
                </div>
              )}
              {asset.brand && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Brand</p>
                  <p className="text-sm text-gray-900">{asset.brand}</p>
                </div>
              )}
              {asset.model && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Model</p>
                  <p className="text-sm text-gray-900">{asset.model}</p>
                </div>
              )}
              {asset.location_name && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Location</p>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <p className="text-sm text-gray-900">{asset.location_name}</p>
                  </div>
                </div>
              )}
              {asset.purchase_date && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Purchase Date</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <p className="text-sm text-gray-900">{new Date(asset.purchase_date).toLocaleDateString()}</p>
                  </div>
                </div>
              )}
              {asset.purchase_cost != null && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Purchase Cost</p>
                  <p className="text-sm text-gray-900">
                    {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
                      Number(asset.purchase_cost) / 100,
                    )}
                  </p>
                </div>
              )}
              {asset.warranty_expiry && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Warranty Expiry</p>
                  <div className="flex items-center gap-2">
                    <Shield className={`h-4 w-4 ${warrantyExpired ? "text-red-500" : "text-green-500"}`} />
                    <p className={`text-sm ${warrantyExpired ? "text-red-600 font-medium" : "text-gray-900"}`}>
                      {new Date(asset.warranty_expiry).toLocaleDateString()}
                      {warrantyExpired && " (Expired)"}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {asset.description && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Description</p>
                <p className="text-sm text-gray-700">{asset.description}</p>
              </div>
            )}
            {asset.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-700">{asset.notes}</p>
              </div>
            )}
          </div>

          {/* Assignment Info */}
          {asset.status === "assigned" && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-blue-900 mb-3">Currently Assigned</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-blue-600 mb-1">Assigned To</p>
                  <p className="text-sm font-medium text-blue-900">{asset.assigned_to_name}</p>
                </div>
                {asset.assigned_at && (
                  <div>
                    <p className="text-xs text-blue-600 mb-1">Assigned At</p>
                    <p className="text-sm text-blue-900">{new Date(asset.assigned_at).toLocaleString()}</p>
                  </div>
                )}
                {asset.assigned_by_name && (
                  <div>
                    <p className="text-xs text-blue-600 mb-1">Assigned By</p>
                    <p className="text-sm text-blue-900">{asset.assigned_by_name}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* History Timeline */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">History</h2>
          </div>
          {asset.history && asset.history.length > 0 ? (
            <div className="relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200" />
              <div className="space-y-4">
                {asset.history.map((entry: any) => (
                  <div key={entry.id} className="relative pl-6 group">
                    <div className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${ACTION_COLORS[entry.action] || "bg-gray-400"}`} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 capitalize">{entry.action}</p>
                        {entry.to_user_name && (
                          <p className="text-xs text-gray-600">To: {entry.to_user_name}</p>
                        )}
                        {entry.from_user_name && (
                          <p className="text-xs text-gray-600">From: {entry.from_user_name}</p>
                        )}
                        {entry.notes && (
                          <p className="text-xs text-gray-500 mt-0.5">{entry.notes}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {entry.performed_by_name} &middot; {new Date(entry.created_at).toLocaleString()}
                        </p>
                      </div>
                      {isHR && (
                        <button
                          onClick={() => {
                            setHistoryDeleteId(entry.id);
                            setHistoryDeleteError(null);
                          }}
                          title="Delete history entry"
                          className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
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
            <p className="text-sm text-gray-400">No history entries</p>
          )}
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Assign Asset</h2>
              <button onClick={() => setShowAssignModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-400" />
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign To *</label>
                <select
                  required
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select employee</option>
                  {(users || []).map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name} {u.last_name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {assignMutation.isPending ? "Assigning..." : "Assign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Return Asset</h2>
              <button onClick={() => setShowReturnModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-400" />
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition on Return</label>
                <select
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="new">New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={returnMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {returnMutation.isPending ? "Returning..." : "Return Asset"}
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
            title: "Retire this asset?",
            body: "Retiring an asset takes it out of active inventory. Past assignments stay on record but the asset can no longer be assigned.",
            confirmLabel: "Retire Asset",
            iconColor: "text-gray-600 bg-gray-100",
            confirmBtn: "bg-gray-900 hover:bg-black",
            Icon: Trash2,
          },
          lost: {
            mutation: reportLostMutation,
            title: "Report asset as lost?",
            body: "This will mark the asset as lost and record it in the audit history. You can mark it found later from the asset detail page.",
            confirmLabel: "Report as Lost",
            iconColor: "text-red-600 bg-red-50",
            confirmBtn: "bg-red-600 hover:bg-red-700",
            Icon: AlertTriangle,
          },
          found: {
            mutation: markFoundMutation,
            title: "Mark asset as found?",
            body: "This will return the asset to active inventory as available, so it can be reassigned.",
            confirmLabel: "Mark as Found",
            iconColor: "text-green-600 bg-green-50",
            confirmBtn: "bg-green-600 hover:bg-green-700",
            Icon: PackageCheck,
          },
          repair_start: {
            mutation: sendToRepairMutation,
            title: "Send asset for repair?",
            body:
              asset.status === "assigned"
                ? "This will unassign the asset and move it to 'In Repair'. The current holder stays recorded in the history."
                : "This will move the asset to 'In Repair'. It won't be assignable until repair is complete.",
            confirmLabel: "Send for Repair",
            iconColor: "text-yellow-700 bg-yellow-50",
            confirmBtn: "bg-yellow-600 hover:bg-yellow-700",
            Icon: Wrench,
          },
          repair_complete: {
            mutation: completeRepairMutation,
            title: "Mark repair as complete?",
            body: "This will return the asset to active inventory as available, so it can be reassigned.",
            confirmLabel: "Mark as Repaired",
            iconColor: "text-green-600 bg-green-50",
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
              className="w-full max-w-md rounded-xl bg-white shadow-xl"
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
                    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      <span className="font-medium text-gray-700">
                        {asset.asset_tag} — {asset.name}
                      </span>
                    </p>
                    <p className="mt-2 text-sm text-gray-500">{body}</p>
                  </div>
                </div>
              </div>
              {confirmError && (
                <div className="mx-6 mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {confirmError}
                </div>
              )}
              <div className="flex justify-end gap-3 rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  disabled={pending}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={run}
                  disabled={pending}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${confirmBtn}`}
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Working...
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
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Edit Asset</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={submitEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={editForm.category_id}
                    onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Uncategorized</option>
                    {(categories || []).map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={editForm.serial_number}
                    onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={editForm.brand}
                    onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                  <input
                    type="text"
                    value={editForm.model}
                    onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                  <select
                    value={editForm.condition_status}
                    onChange={(e) =>
                      setEditForm({ ...editForm, condition_status: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="new">New</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                  <input
                    type="date"
                    value={editForm.purchase_date}
                    onChange={(e) => setEditForm({ ...editForm, purchase_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Cost</label>
                  <div className="flex items-stretch">
                    <span className="inline-flex items-center px-3 py-2 rounded-l-lg border border-r-0 border-gray-200 bg-gray-50 text-sm text-gray-600">
                      ₹ INR
                    </span>
                    <input
                      type="number"
                      value={editForm.purchase_cost}
                      onChange={(e) =>
                        setEditForm({ ...editForm, purchase_cost: e.target.value })
                      }
                      className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Amount in paise.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Warranty Expiry</label>
                  <input
                    type="date"
                    value={editForm.warranty_expiry}
                    onChange={(e) => setEditForm({ ...editForm, warranty_expiry: e.target.value })}
                    min={editForm.purchase_date || undefined}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={editForm.location_name}
                    onChange={(e) => setEditForm({ ...editForm, location_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              {editError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{editError}</div>
              )}
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    "Save Changes"
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
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Delete history entry?</h3>
                  <p className="mt-2 text-sm text-gray-500">
                    This removes just this log row. The asset's current status stays unchanged —
                    past assignments or actions are not reverted.
                  </p>
                </div>
              </div>
            </div>
            {historyDeleteError && (
              <div className="mx-6 mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {historyDeleteError}
              </div>
            )}
            <div className="flex justify-end gap-3 rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setHistoryDeleteId(null)}
                disabled={deleteHistoryMutation.isPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteHistoryMutation.mutate(historyDeleteId)}
                disabled={deleteHistoryMutation.isPending}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deleteHistoryMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
                  </>
                ) : (
                  "Delete Entry"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
