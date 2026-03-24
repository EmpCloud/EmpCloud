import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useState } from "react";
import { UserPlus, Trash2, Camera } from "lucide-react";

export default function FaceEnrollmentPage() {
  const queryClient = useQueryClient();
  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollUserId, setEnrollUserId] = useState("");
  const [enrollMethod, setEnrollMethod] = useState<"webcam" | "upload" | "device">("upload");

  const { data: enrollments, isLoading } = useQuery({
    queryKey: ["biometric-enrollments"],
    queryFn: () => api.get("/biometrics/face/enrollments").then((r) => r.data.data),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => api.get("/users", { params: { per_page: 100 } }).then((r) => r.data.data),
    enabled: showEnroll,
  });

  const enrollMutation = useMutation({
    mutationFn: (data: { user_id: number; enrollment_method: string }) =>
      api.post("/biometrics/face/enroll", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-enrollments"] });
      setShowEnroll(false);
      setEnrollUserId("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/biometrics/face/enrollments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-enrollments"] });
    },
  });

  const handleEnroll = () => {
    if (!enrollUserId) return;
    enrollMutation.mutate({
      user_id: Number(enrollUserId),
      enrollment_method: enrollMethod,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Face Enrollment</h1>
          <p className="text-gray-500 mt-1">Manage employee face data for biometric attendance.</p>
        </div>
        <button
          onClick={() => setShowEnroll(!showEnroll)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Enroll Employee
        </button>
      </div>

      {/* Enroll Form */}
      {showEnroll && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">New Face Enrollment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <select
                value={enrollUserId}
                onChange={(e) => setEnrollUserId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select employee...</option>
                {(usersData || []).map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name} {u.last_name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
              <select
                value={enrollMethod}
                onChange={(e) => setEnrollMethod(e.target.value as any)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="upload">Photo Upload</option>
                <option value="webcam">Webcam Capture</option>
                <option value="device">Device Capture</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleEnroll}
                disabled={!enrollUserId || enrollMutation.isPending}
                className="bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors text-sm"
              >
                {enrollMutation.isPending ? "Enrolling..." : "Enroll"}
              </button>
            </div>
          </div>
          {enrollMutation.isError && (
            <p className="text-red-600 text-sm mt-2">
              {(enrollMutation.error as any)?.response?.data?.error?.message || "Failed to enroll"}
            </p>
          )}
        </div>
      )}

      {/* Enrollments Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Enrolled Employees</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Method</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Quality</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Enrolled</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : !enrollments?.length ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No face enrollments yet</td></tr>
            ) : (
              enrollments.map((e: any) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">
                        {e.first_name?.[0]}{e.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{e.first_name} {e.last_name}</p>
                        <p className="text-xs text-gray-400">{e.emp_code || e.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center gap-1.5 text-sm text-gray-600 capitalize">
                      <Camera className="h-3.5 w-3.5" />
                      {e.enrollment_method}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {e.quality_score != null ? `${e.quality_score}%` : "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(e.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => {
                        if (confirm("Remove this face enrollment?")) {
                          removeMutation.mutate(e.id);
                        }
                      }}
                      className="text-red-600 hover:text-red-800 transition-colors"
                      title="Remove enrollment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
