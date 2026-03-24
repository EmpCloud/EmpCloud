import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useState, useEffect } from "react";
import { Settings, Save } from "lucide-react";

export default function BiometricSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    face_match_threshold: 0.75,
    liveness_required: true,
    selfie_geo_required: true,
    geo_radius_meters: 200,
    qr_type: "rotating" as "static" | "rotating",
    qr_rotation_minutes: 5,
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["biometric-settings"],
    queryFn: () => api.get("/biometrics/settings").then((r) => r.data.data),
  });

  useEffect(() => {
    if (settings) {
      setForm({
        face_match_threshold: Number(settings.face_match_threshold) || 0.75,
        liveness_required: Boolean(settings.liveness_required),
        selfie_geo_required: Boolean(settings.selfie_geo_required),
        geo_radius_meters: settings.geo_radius_meters || 200,
        qr_type: settings.qr_type || "rotating",
        qr_rotation_minutes: settings.qr_rotation_minutes || 5,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) => api.put("/biometrics/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-settings"] });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biometric Settings</h1>
          <p className="text-gray-500 mt-1">Configure biometric attendance parameters for your organization.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {saveMutation.isSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 mb-6">
          Settings saved successfully.
        </div>
      )}

      <div className="space-y-6">
        {/* Face Recognition */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-500" />
            Face Recognition
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Face Match Threshold
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.face_match_threshold}
                onChange={(e) => setForm({ ...form, face_match_threshold: parseFloat(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Minimum confidence score (0.0 to 1.0) required for a face match. Higher = stricter.
              </p>
            </div>
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.liveness_required}
                  onChange={(e) => setForm({ ...form, liveness_required: e.target.checked })}
                  className="h-4 w-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">Liveness Detection Required</span>
                  <p className="text-xs text-gray-400">Reject photo/video spoofing attempts.</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Geo-fence */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-500" />
            Location Verification
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.selfie_geo_required}
                  onChange={(e) => setForm({ ...form, selfie_geo_required: e.target.checked })}
                  className="h-4 w-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">GPS Required for Selfie/Face</span>
                  <p className="text-xs text-gray-400">Employees must share location for face/selfie check-in.</p>
                </div>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Geo-fence Radius (meters)
              </label>
              <input
                type="number"
                min="10"
                max="50000"
                value={form.geo_radius_meters}
                onChange={(e) => setForm({ ...form, geo_radius_meters: parseInt(e.target.value) || 200 })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Maximum distance from office location for valid biometric check-in.
              </p>
            </div>
          </div>
        </div>

        {/* QR Code */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-500" />
            QR Code Attendance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                QR Code Type
              </label>
              <select
                value={form.qr_type}
                onChange={(e) => setForm({ ...form, qr_type: e.target.value as "static" | "rotating" })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="rotating">Rotating (expires periodically)</option>
                <option value="static">Static (permanent)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Rotating QR codes are more secure as they expire and regenerate.
              </p>
            </div>
            {form.qr_type === "rotating" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rotation Interval (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={form.qr_rotation_minutes}
                  onChange={(e) => setForm({ ...form, qr_rotation_minutes: parseInt(e.target.value) || 5 })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  How often the QR code rotates. Lower = more secure.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
