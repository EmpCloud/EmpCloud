import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserPlus, X, Briefcase, AlertTriangle, MapPin, Pencil, Trash2, Save, Loader2 } from "lucide-react";
import { useDepartments } from "@/api/hooks";
import api from "@/api/client";

export default function PositionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAssign, setShowAssign] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [assignForm, setAssignForm] = useState({ user_id: "", start_date: "", is_primary: true });
  const [userSearch, setUserSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editForm, setEditForm] = useState({
    title: "",
    department_id: "",
    employment_type: "full_time",
    headcount_budget: 1,
    is_critical: false,
    job_description: "",
    min_salary: "",
    max_salary: "",
    currency: "INR",
  });

  const { data: departments } = useDepartments();

  // Debounce the user search to avoid excessive API calls (especially with full name typing)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(userSearch), 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  const { data, isLoading } = useQuery({
    queryKey: ["position", id],
    queryFn: () => api.get(`/positions/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const { data: usersData } = useQuery({
    queryKey: ["users-search", debouncedSearch],
    queryFn: () => api.get("/users", { params: { search: debouncedSearch || undefined, per_page: 50 } }).then((r) => r.data.data),
    enabled: showAssign,
  });

  const assignMutation = useMutation({
    mutationFn: (body: object) => api.post(`/positions/${id}/assign`, body).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["position", id] });
      setShowAssign(false);
      setAssignForm({ user_id: "", start_date: "", is_primary: true });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (assignmentId: number) => api.delete(`/positions/assignments/${assignmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["position", id] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      api.put(`/positions/${id}`, { status: newStatus }).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["position", id] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) =>
      api.put(`/positions/${id}`, data).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["position", id] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      setShowEdit(false);
    },
  });

  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/positions/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["position-dashboard"] });
      setShowDelete(false);
      setDeleteError(null);
      navigate("/positions/list");
    },
    onError: (err: any) =>
      setDeleteError(err?.response?.data?.error?.message || "Failed to delete position"),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-400">Loading...</div></div>;
  }

  const pos = data;
  if (!pos) {
    return <div className="text-center py-12 text-gray-400">Position not found</div>;
  }

  const activeAssignments = (pos.assignments || []).filter((a: any) => a.status === "active");
  const pastAssignments = (pos.assignments || []).filter((a: any) => a.status === "ended");

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    assignMutation.mutate({
      user_id: Number(assignForm.user_id),
      start_date: assignForm.start_date,
      is_primary: assignForm.is_primary,
    });
  };

  return (
    <div>
      <Link to="/positions/list" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Positions
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{pos.title}</h1>
            {pos.is_critical && <AlertTriangle className="h-5 w-5 text-red-500" />}
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            {pos.code && <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{pos.code}</span>}
            {pos.department_name && <span>{pos.department_name}</span>}
            {pos.location_name && (
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{pos.location_name}</span>
            )}
            <select
              value={pos.status}
              onChange={(e) => {
                if (e.target.value !== pos.status) {
                  updateStatusMutation.mutate(e.target.value);
                }
              }}
              disabled={updateStatusMutation.isPending}
              className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${
                pos.status === "active" ? "bg-green-50 text-green-700" :
                pos.status === "filled" ? "bg-blue-50 text-blue-700" :
                pos.status === "frozen" ? "bg-amber-50 text-amber-700" :
                "bg-gray-100 text-gray-500"
              }`}
            >
              <option value="active">Active</option>
              <option value="filled">Filled</option>
              <option value="frozen">Frozen</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditForm({
                title: pos.title || "",
                department_id: pos.department_id ? String(pos.department_id) : "",
                employment_type: pos.employment_type || "full_time",
                headcount_budget: pos.headcount_budget || 1,
                is_critical: pos.is_critical || false,
                job_description: pos.job_description || "",
                min_salary: pos.min_salary ? String(pos.min_salary) : "",
                max_salary: pos.max_salary ? String(pos.max_salary) : "",
                currency: pos.currency || "INR",
              });
              setShowEdit(!showEdit);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={() => {
              setShowDelete(true);
              setDeleteError(null);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
          {(pos.status === "active" || pos.status === "filled") && pos.headcount_filled < pos.headcount_budget && (
            <button
              onClick={() => setShowAssign(!showAssign)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
            >
              <UserPlus className="h-4 w-4" />
              Assign Employee
            </button>
          )}
        </div>
      </div>

      {/* Assign Form */}
      {showAssign && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Assign Employee to Position</h3>
          <form onSubmit={handleAssign} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-2"
              />
              <select
                value={assignForm.user_id}
                onChange={(e) => setAssignForm({ ...assignForm, user_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              >
                <option value="">Select Employee</option>
                {(usersData || []).map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name} {u.last_name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input
                type="date"
                value={assignForm.start_date}
                onChange={(e) => setAssignForm({ ...assignForm, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={assignForm.is_primary}
                  onChange={(e) => setAssignForm({ ...assignForm, is_primary: e.target.checked })}
                  className="h-4 w-4 text-brand-600 border-gray-300 rounded"
                />
                Primary Position
              </label>
            </div>
            <div className="col-span-full flex gap-3">
              <button
                type="submit"
                disabled={assignMutation.isPending}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {assignMutation.isPending ? "Assigning..." : "Assign"}
              </button>
              <button type="button" onClick={() => setShowAssign(false)} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
            {assignMutation.isError && (
              <p className="col-span-full text-sm text-red-600">
                {(assignMutation.error as any)?.response?.data?.error?.message || "Failed to assign"}
              </p>
            )}
          </form>
        </div>
      )}

      {/* Edit Form */}
      {showEdit && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Position</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate({
                title: editForm.title,
                department_id: editForm.department_id ? Number(editForm.department_id) : null,
                employment_type: editForm.employment_type,
                headcount_budget: Number(editForm.headcount_budget),
                is_critical: editForm.is_critical,
                job_description: editForm.job_description || null,
                min_salary: editForm.min_salary ? Number(editForm.min_salary) : null,
                max_salary: editForm.max_salary ? Number(editForm.max_salary) : null,
                currency: editForm.currency,
              });
            }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                value={editForm.department_id}
                onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">None</option>
                {(departments || []).map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
              <select
                value={editForm.employment_type}
                onChange={(e) => setEditForm({ ...editForm, employment_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Headcount Budget</label>
              <input
                type="number"
                value={editForm.headcount_budget}
                onChange={(e) => setEditForm({ ...editForm, headcount_budget: Number(e.target.value) })}
                min={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Salary (paise/cents)</label>
              <input
                type="number"
                value={editForm.min_salary}
                onChange={(e) => setEditForm({ ...editForm, min_salary: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Salary (paise/cents)</label>
              <input
                type="number"
                value={editForm.max_salary}
                onChange={(e) => setEditForm({ ...editForm, max_salary: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="col-span-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
              <textarea
                value={editForm.job_description}
                onChange={(e) => setEditForm({ ...editForm, job_description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit_is_critical"
                checked={editForm.is_critical}
                onChange={(e) => setEditForm({ ...editForm, is_critical: e.target.checked })}
                className="h-4 w-4 text-brand-600 border-gray-300 rounded"
              />
              <label htmlFor="edit_is_critical" className="text-sm text-gray-700">Critical Role</label>
            </div>
            <div className="col-span-full flex gap-3">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
            {updateMutation.isError && (
              <p className="col-span-full text-sm text-red-600">
                {(updateMutation.error as any)?.response?.data?.error?.message || "Failed to update position"}
              </p>
            )}
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Position Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Position Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Employment Type</span>
                <p className="font-medium text-gray-900 capitalize mt-1">{(pos.employment_type || "").replace("_", " ")}</p>
              </div>
              <div>
                <span className="text-gray-500">Headcount</span>
                <p className="font-medium text-gray-900 mt-1">{pos.headcount_filled} / {pos.headcount_budget}</p>
              </div>
              {(pos.min_salary || pos.max_salary) && (
                <div>
                  <span className="text-gray-500">Salary Range</span>
                  <p className="font-medium text-gray-900 mt-1">
                    {pos.currency} {pos.min_salary ? (pos.min_salary / 100).toLocaleString() : "0"} - {pos.max_salary ? (pos.max_salary / 100).toLocaleString() : "0"}
                  </p>
                </div>
              )}
              {pos.reports_to && (
                <div>
                  <span className="text-gray-500">Reports To</span>
                  <p className="font-medium text-gray-900 mt-1">
                    <Link to={`/positions/${pos.reports_to.id}`} className="text-brand-600 hover:underline">
                      {pos.reports_to.title} ({pos.reports_to.code})
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Job Description */}
          {pos.job_description && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Job Description</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{pos.job_description}</p>
            </div>
          )}

          {/* Requirements */}
          {pos.requirements && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Requirements</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{pos.requirements}</p>
            </div>
          )}
        </div>

        {/* Sidebar — Assignments */}
        <div className="space-y-6">
          {/* Current Assignees */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Current Assignees ({activeAssignments.length})
            </h3>
            {activeAssignments.length === 0 ? (
              <p className="text-sm text-gray-400">No one assigned</p>
            ) : (
              <div className="space-y-3">
                {activeAssignments.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">
                        {a.first_name?.[0]}{a.last_name?.[0]}
                      </div>
                      <div>
                        <Link to={`/employees/${a.user_id}`} className="text-sm font-medium text-gray-900 hover:text-brand-600">
                          {a.first_name} {a.last_name}
                        </Link>
                        <p className="text-xs text-gray-500">Since {new Date(a.start_date).toLocaleDateString()}</p>
                        {!a.is_primary && <span className="text-xs text-amber-600">Acting/Interim</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm("End this assignment?")) removeMutation.mutate(a.id);
                      }}
                      className="text-gray-400 hover:text-red-500"
                      title="End assignment"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past Assignments */}
          {pastAssignments.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Assignment History</h3>
              <div className="space-y-2">
                {pastAssignments.map((a: any) => (
                  <div key={a.id} className="text-sm text-gray-500 flex items-center gap-2">
                    <Briefcase className="h-3 w-3" />
                    <span>
                      {a.first_name} {a.last_name} ({new Date(a.start_date).toLocaleDateString()} - {a.end_date ? new Date(a.end_date).toLocaleDateString() : "N/A"})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteMutation.isPending && setShowDelete(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Delete position?</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Delete{" "}
                    <span className="font-medium text-gray-700">{pos.title}</span>?
                    Active assignments are ended and the position is closed. This cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            {deleteError && (
              <div className="mx-6 mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3 rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                disabled={deleteMutation.isPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
