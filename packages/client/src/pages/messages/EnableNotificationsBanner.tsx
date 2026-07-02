// =============================================================================
// EMP CLOUD — "Enable desktop alerts" banner (Messages page)
// =============================================================================
//
// A dismissible prompt to turn on browser desktop notifications. Shown only when
// the browser supports notifications and permission is still "default" (not yet
// asked/granted/denied). The request MUST come from this click — browsers ignore
// Notification.requestPermission() unless triggered by a user gesture.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, X } from "lucide-react";
import { showToast } from "@/components/ui/Toast";

const SUPPORTED = typeof window !== "undefined" && "Notification" in window;
const DISMISS_KEY = "empcloud-chat-notif-dismissed";

export function EnableNotificationsBanner() {
  const { t } = useTranslation();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    SUPPORTED ? Notification.permission : "unsupported",
  );
  const [dismissed, setDismissed] = useState(
    // localStorage (not sessionStorage) so a dismissal persists across reloads
    // and browser restarts — the banner shouldn't keep coming back every visit.
    () => localStorage.getItem(DISMISS_KEY) === "1",
  );
  const [asking, setAsking] = useState(false);

  if (!SUPPORTED || perm !== "default" || dismissed) return null;

  const enable = async () => {
    setAsking(true);
    try {
      const result = await Notification.requestPermission();
      setPerm(result);
      if (result === "granted") {
        showToast("success", t("enableNotificationsBanner.toast.enabledSuccess"));
        // A quick confirmation notification so the user sees it works.
        try {
          const n = new Notification(t("enableNotificationsBanner.confirmation.title"), {
            body: t("enableNotificationsBanner.confirmation.body"),
            icon: "/favicon.ico",
          });
          setTimeout(() => n.close(), 4000);
        } catch {
          /* ignore */
        }
      } else if (result === "denied") {
        showToast("error", t("enableNotificationsBanner.toast.blocked"));
      }
    } finally {
      setAsking(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5">
      <BellRing className="h-5 w-5 flex-shrink-0 text-brand-600" />
      <p className="flex-1 text-sm text-brand-800">
        {t("enableNotificationsBanner.description")}
      </p>
      <button
        onClick={enable}
        disabled={asking}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {asking ? t("enableNotificationsBanner.button.enabling") : t("enableNotificationsBanner.button.enable")}
      </button>
      <button
        onClick={dismiss}
        className="p-1 rounded-lg text-brand-400 hover:bg-brand-100"
        aria-label={t("enableNotificationsBanner.button.dismissAriaLabel")}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
