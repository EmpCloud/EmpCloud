// =============================================================================
// EMP CLOUD — Confirmation Dialog (replaces window.confirm)
// =============================================================================
//
// Usage:
//   <ConfirmDialog
//     open={open}
//     title="Mark as filled?"
//     description="This position will be removed from the open vacancies list."
//     confirmText="Mark as Filled"
//     variant="success"
//     loading={mutation.isPending}
//     onConfirm={() => mutation.mutate(id)}
//     onCancel={() => setOpen(false)}
//   />
// =============================================================================

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

type Variant = "danger" | "success" | "info";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: Variant;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_STYLES: Record<Variant, { icon: typeof AlertTriangle; iconBg: string; iconColor: string; button: string }> = {
  danger: {
    icon: AlertTriangle,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    button: "bg-red-600 hover:bg-red-700",
  },
  success: {
    icon: CheckCircle2,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    button: "bg-green-600 hover:bg-green-700",
  },
  info: {
    icon: AlertTriangle,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    button: "bg-brand-600 hover:bg-brand-700",
  },
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "info",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const style = VARIANT_STYLES[variant];
  const Icon = style.icon;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className={`shrink-0 rounded-full p-2 ${style.iconBg}`}>
                <Icon className={`h-5 w-5 ${style.iconColor}`} />
              </div>
              <div className="flex-1">
                <Dialog.Title className="text-base font-semibold text-gray-900">
                  {title}
                </Dialog.Title>
                {description && (
                  <Dialog.Description className="mt-2 text-sm text-gray-600">
                    {description}
                  </Dialog.Description>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 rounded-b-xl">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${style.button}`}
            >
              {loading ? "Working..." : confirmText}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
