// =============================================================================
// EMP CLOUD — Message tick glyphs (sent / delivered / read / sending / failed)
// =============================================================================

import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react";
import type { TickStatus } from "@empcloud/shared";

export function MessageTick({
  status,
  onRetry,
}: {
  status: TickStatus | null;
  onRetry?: () => void;
}) {
  if (!status) return null;
  // Rendered in the light metadata row below the bubble, so colors target a
  // light background: grey for sending/sent/delivered, blue for read, red fail.
  switch (status) {
    case "sending":
      return <Clock className="h-3.5 w-3.5 text-gray-400" aria-label="Sending" />;
    case "sent":
      return <Check className="h-3.5 w-3.5 text-gray-400" aria-label="Sent" />;
    case "delivered":
      return <CheckCheck className="h-3.5 w-3.5 text-gray-400" aria-label="Delivered" />;
    case "read":
      return <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label="Read" />;
    case "failed":
      return (
        <span
          role="button"
          onClick={onRetry}
          title="Failed to send — tap to retry"
          aria-label="Failed to send, retry"
          className="text-red-500 hover:text-red-600 cursor-pointer"
        >
          <AlertCircle className="h-3.5 w-3.5" />
        </span>
      );
    default:
      return null;
  }
}
