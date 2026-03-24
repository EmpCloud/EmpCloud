import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { QrCode, RefreshCw, LogIn, LogOut } from "lucide-react";
import { useState, useEffect } from "react";

export default function QRAttendancePage() {
  const queryClient = useQueryClient();
  const [countdown, setCountdown] = useState<number | null>(null);

  const { data: qrData, isLoading } = useQuery({
    queryKey: ["my-qr-code"],
    queryFn: () => api.get("/biometrics/qr/my-code").then((r) => r.data.data),
    refetchInterval: 30000, // Refresh every 30s
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.get("/biometrics/qr/my-code"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-qr-code"] });
    },
  });

  const checkInMutation = useMutation({
    mutationFn: () =>
      api.post("/biometrics/check-in", {
        method: "qr",
        qr_code: qrData?.code,
      }),
  });

  const checkOutMutation = useMutation({
    mutationFn: () =>
      api.post("/biometrics/check-out", {
        method: "qr",
        qr_code: qrData?.code,
      }),
  });

  // Countdown timer for rotating QR
  useEffect(() => {
    if (!qrData?.valid_until || qrData?.type !== "rotating") {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((new Date(qrData.valid_until).getTime() - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        queryClient.invalidateQueries({ queryKey: ["my-qr-code"] });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [qrData?.valid_until, qrData?.type, queryClient]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">QR Attendance</h1>
        <p className="text-gray-500 mt-1">Your personal QR code for biometric attendance.</p>
      </div>

      <div className="max-w-md mx-auto">
        {/* QR Code Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          {isLoading ? (
            <div className="py-16 text-gray-400">Loading QR code...</div>
          ) : qrData ? (
            <>
              {/* QR Code Display */}
              <div className="bg-gray-50 rounded-xl p-8 mb-6 inline-block">
                <QrCode className="h-48 w-48 text-gray-800 mx-auto" />
              </div>

              <div className="mb-4">
                <p className="text-sm font-mono text-gray-500 bg-gray-50 px-4 py-2 rounded-lg break-all">
                  {qrData.code}
                </p>
              </div>

              <div className="flex items-center justify-center gap-4 mb-4">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  qrData.type === "rotating"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-gray-50 text-gray-700"
                }`}>
                  {qrData.type === "rotating" ? "Rotating" : "Static"} QR
                </span>
                {qrData.type === "rotating" && countdown !== null && (
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    countdown < 30
                      ? "bg-red-50 text-red-700"
                      : "bg-green-50 text-green-700"
                  }`}>
                    Expires in {formatCountdown(countdown)}
                  </span>
                )}
              </div>

              <button
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
                className="flex items-center gap-2 mx-auto text-sm text-brand-600 hover:text-brand-700 transition-colors"
              >
                <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
                Refresh QR Code
              </button>
            </>
          ) : (
            <div className="py-16">
              <QrCode className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-400">No QR code available</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          <button
            onClick={() => checkInMutation.mutate()}
            disabled={checkInMutation.isPending || !qrData}
            className="flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-3 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
          >
            <LogIn className="h-5 w-5" />
            {checkInMutation.isPending ? "Checking in..." : "Check In"}
          </button>
          <button
            onClick={() => checkOutMutation.mutate()}
            disabled={checkOutMutation.isPending || !qrData}
            className="flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-3 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
          >
            <LogOut className="h-5 w-5" />
            {checkOutMutation.isPending ? "Checking out..." : "Check Out"}
          </button>
        </div>

        {checkInMutation.isSuccess && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
            Successfully checked in via QR code.
          </div>
        )}
        {checkOutMutation.isSuccess && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
            Successfully checked out via QR code.
          </div>
        )}
        {(checkInMutation.isError || checkOutMutation.isError) && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {(checkInMutation.error as any)?.response?.data?.error?.message ||
             (checkOutMutation.error as any)?.response?.data?.error?.message ||
             "Operation failed"}
          </div>
        )}
      </div>
    </div>
  );
}
