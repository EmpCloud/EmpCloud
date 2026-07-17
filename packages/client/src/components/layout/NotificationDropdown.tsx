import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import api from "@/api/client";
import { Bell, BellRing } from "lucide-react";
import { ensureNotificationPermission } from "@/realtime/desktop-notify";

const NOTIF_SUPPORTED = typeof window !== "undefined" && "Notification" in window;

export function NotificationDropdown() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  // Desktop-notification permission state (drives the enable row).
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(
    NOTIF_SUPPORTED ? Notification.permission : "unsupported",
  );

  const enableDesktopAlerts = async () => {
    const result = await ensureNotificationPermission();
    setNotifPerm(result);
  };

  const { data: unreadData } = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: () => api.get("/notifications/unread-count").then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const { data: notificationsData } = useQuery({
    queryKey: ["notifications-recent"],
    queryFn: () =>
      api.get("/notifications", { params: { page: 1, per_page: 10 } }).then((r) => r.data),
    enabled: open,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.put("/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent"] });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: number) => api.put(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-recent"] });
    },
  });

  const unreadCount = unreadData?.count ?? 0;
  const notifications = notificationsData?.data || [];

  // Clicking a notification marks it read and, when it deep-links (e.g. a chat
  // mention), navigates to the target.
  const handleNotificationClick = (n: {
    id: number;
    is_read: boolean;
    reference_type?: string | null;
    reference_id?: string | null;
  }) => {
    if (!n.is_read) markRead.mutate(n.id);
    if (n.reference_type === "chat_conversation" && n.reference_id) {
      setOpen(false);
      navigate(`/messages/${n.reference_id}`);
    }
  };

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        // Icon-only control in the topbar: give it an accessible name + a
        // hover tooltip so it's not an unlabelled bell.
        title={t('common.notifications')}
        aria-label={t('common.notifications')}
        className="relative p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed right-4 top-14 w-96 bg-card border border-border rounded-xl shadow-lg overflow-hidden" style={{ zIndex: 9999 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">{t('common.notifications')}</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
              >
                {t('common.markAllRead')}
              </button>
            )}
          </div>

          {/* Desktop-alerts opt-in: get notified of new chat messages even while
              focused on another app. */}
          {notifPerm === "default" && (
            <button
              onClick={enableDesktopAlerts}
              className="flex w-full items-center gap-2 px-4 py-2.5 border-b border-border bg-brand-50/50 dark:bg-brand-950/30 text-left text-xs text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/50"
            >
              <BellRing className="h-4 w-4 flex-shrink-0" />
              <span>Enable desktop alerts for new messages</span>
            </button>
          )}
          {notifPerm === "denied" && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-700 dark:text-amber-300">
              <BellRing className="h-4 w-4 flex-shrink-0" />
              <span>Desktop alerts are blocked. Enable them in your browser's site settings.</span>
            </div>
          )}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('common.noNotifications')}
              </div>
            ) : (
              notifications.map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted transition-colors ${
                    !n.is_read ? "bg-brand-50/50 dark:bg-brand-950/30" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && (
                      <div className="h-2 w-2 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                    )}
                    <div className={!n.is_read ? "" : "ml-4"}>
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
