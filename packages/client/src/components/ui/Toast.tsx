// =============================================================================
// EMP CLOUD — Lightweight Toast Notification System
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { X, AlertCircle, CheckCircle, Info } from "lucide-react";

interface ToastMessage {
  id: number;
  type: "error" | "success" | "info";
  message: string;
}

let toastId = 0;
let addToastFn: ((toast: Omit<ToastMessage, "id">) => void) | null = null;

/** Show a toast notification from anywhere (outside React components). */
export function showToast(type: ToastMessage["type"], message: string) {
  addToastFn?.({ type, message });
}

const ICONS = {
  error: AlertCircle,
  success: CheckCircle,
  info: Info,
};

const COLORS = {
  error: "bg-red-50 border-red-200 text-red-800",
  success: "bg-green-50 border-green-200 text-green-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
};

const ICON_COLORS = {
  error: "text-red-500",
  success: "text-green-500",
  info: "text-blue-500",
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-4), { ...toast, id }]); // Keep max 5
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => {
      addToastFn = null;
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg animate-in slide-in-from-right ${COLORS[toast.type]}`}
            role="alert"
          >
            <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${ICON_COLORS[toast.type]}`} />
            <p className="text-sm flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 p-0.5 rounded hover:bg-black/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
