import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import {
  ArrowLeft,
  Package,
  UserCheck,
  Calendar,
  MapPin,
  Hash,
  Shield,
  Clock,
  AlertTriangle,
  RotateCcw,
  Trash2,
  X,
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
  repaired: "bg-yellow-500",
  retired: "bg-gray-500",
  lost: "bg-red-500",
  damaged: "bg-orange-500",
  updated: "bg-indigo-500",
};

export default function AssetDetailPage() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [returnCondition, setReturnCondition] = useState("good");
  const [returnNotes, setReturnNotes] = useState("");

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset", id] }),
  });

  const reportLostMutation = useMutation({
    mutationFn: () => api.post(`/assets/${id}/report-lost`, { notes: "Reported lost via dashboard" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset", id] }),
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
          <div className="flex gap-2">
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
            {asset.status !== "retired" && asset.status !== "lost" && (
              <>
                <button
                  onClick={() => { if (confirm("Retire this asset?")) retireMutation.mutate(); }}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  <Trash2 className="h-4 w-4" />
                  Retire
                </button>
                <button
                  onClick={() => { if (confirm("Report this asset as lost?")) reportLostMutation.mutate(); }}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Report Lost
                </button>
              </>
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
                  <div key={entry.id} className="relative pl-6">
                    <div className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${ACTION_COLORS[entry.action] || "bg-gray-400"}`} />
                    <div>
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
    </div>
  );
}
