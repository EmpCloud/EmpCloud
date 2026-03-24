import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useState } from "react";
import { Plus, Trash2, Wifi, WifiOff, Wrench, Smartphone } from "lucide-react";

const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
  online: { icon: Wifi, color: "bg-green-50 text-green-700", label: "Online" },
  offline: { icon: WifiOff, color: "bg-gray-50 text-gray-600", label: "Offline" },
  maintenance: { icon: Wrench, color: "bg-yellow-50 text-yellow-700", label: "Maintenance" },
};

const deviceTypeLabels: Record<string, string> = {
  face_terminal: "Face Terminal",
  fingerprint_reader: "Fingerprint Reader",
  qr_scanner: "QR Scanner",
  multi: "Multi-Function",
};

export default function DeviceManagementPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "face_terminal" as string,
    serial_number: "",
    ip_address: "",
    location_name: "",
  });
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  const { data: devices, isLoading } = useQuery({
    queryKey: ["biometric-devices"],
    queryFn: () => api.get("/biometrics/devices").then((r) => r.data.data),
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => api.post("/biometrics/devices", data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
      setNewApiKey(res.data.data.api_key);
      setShowAdd(false);
      setForm({ name: "", type: "face_terminal", serial_number: "", ip_address: "", location_name: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/biometrics/devices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["biometric-devices"] });
    },
  });

  const handleAdd = () => {
    addMutation.mutate({
      name: form.name,
      type: form.type,
      serial_number: form.serial_number,
      ip_address: form.ip_address || undefined,
      location_name: form.location_name || undefined,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biometric Devices</h1>
          <p className="text-gray-500 mt-1">Manage registered biometric devices and their status.</p>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setNewApiKey(null); }}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Register Device
        </button>
      </div>

      {/* API Key Alert */}
      {newApiKey && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-yellow-800 mb-1">Device API Key (save this -- it will not be shown again):</p>
          <code className="text-xs bg-yellow-100 px-3 py-1.5 rounded-lg font-mono text-yellow-900 block break-all">
            {newApiKey}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(newApiKey);
            }}
            className="mt-2 text-xs text-yellow-700 hover:text-yellow-900 underline"
          >
            Copy to clipboard
          </button>
        </div>
      )}

      {/* Add Form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Register New Device</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Device Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Lobby Face Scanner"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="face_terminal">Face Terminal</option>
                <option value="fingerprint_reader">Fingerprint Reader</option>
                <option value="qr_scanner">QR Scanner</option>
                <option value="multi">Multi-Function</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
              <input
                type="text"
                value={form.serial_number}
                onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                placeholder="e.g. SN-12345"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">IP Address</label>
              <input
                type="text"
                value={form.ip_address}
                onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
                placeholder="e.g. 192.168.1.100"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                value={form.location_name}
                onChange={(e) => setForm({ ...form, location_name: e.target.value })}
                placeholder="e.g. Main Entrance"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleAdd}
                disabled={!form.name || !form.serial_number || addMutation.isPending}
                className="bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors text-sm"
              >
                {addMutation.isPending ? "Registering..." : "Register"}
              </button>
            </div>
          </div>
          {addMutation.isError && (
            <p className="text-red-600 text-sm mt-2">
              {(addMutation.error as any)?.response?.data?.error?.message || "Failed to register device"}
            </p>
          )}
        </div>
      )}

      {/* Devices Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center text-gray-400 py-12">Loading devices...</div>
        ) : !devices?.length ? (
          <div className="col-span-full text-center text-gray-400 py-12">
            <Smartphone className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No biometric devices registered</p>
          </div>
        ) : (
          devices.map((d: any) => {
            const sc = statusConfig[d.status] || statusConfig.offline;
            const StatusIcon = sc.icon;
            return (
              <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <Smartphone className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{d.name}</p>
                      <p className="text-xs text-gray-400">{deviceTypeLabels[d.type] || d.type}</p>
                    </div>
                  </div>
                  <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${sc.color}`}>
                    <StatusIcon className="h-3 w-3" />
                    {sc.label}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-gray-500 mb-4">
                  <p>Serial: <span className="font-mono text-gray-700">{d.serial_number}</span></p>
                  {d.ip_address && <p>IP: <span className="font-mono text-gray-700">{d.ip_address}</span></p>}
                  {d.location_name && <p>Location: <span className="text-gray-700">{d.location_name}</span></p>}
                  {d.last_heartbeat && (
                    <p>Last ping: <span className="text-gray-700">{new Date(d.last_heartbeat).toLocaleString()}</span></p>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      if (confirm("Decommission this device?")) {
                        deleteMutation.mutate(d.id);
                      }
                    }}
                    className="text-red-500 hover:text-red-700 transition-colors"
                    title="Decommission"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
