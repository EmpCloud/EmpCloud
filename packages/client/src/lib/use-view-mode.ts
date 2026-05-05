// =============================================================================
// EMP CLOUD — View Mode store
// "My view" vs "Admin view" toggle for non-HR users with admin permissions
// granted via custom roles. Lets a user with e.g. attendance:approve_regularization
// switch their sidebar between the employee self-service nav and the admin
// nav (filtered to only the items their permissions unlock) without polluting
// either sidebar.
//
// Persisted to localStorage so the user's choice survives reloads. HR users
// don't see this toggle — they always see the admin sidebar.
// =============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "self" | "admin";

interface ViewModeState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const useViewModeStore = create<ViewModeState>()(
  persist(
    (set) => ({
      viewMode: "self",
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    { name: "empcloud-view-mode" },
  ),
);

/**
 * Permission keys whose presence means the user has at least one admin-side
 * capability — i.e. the role-switcher is worth showing. If a user has none
 * of these, the admin view would be empty and the toggle would be useless.
 *
 * Keep this list inclusive (every "view_all" / "manage" / "approve" / "edit_all"
 * key across the catalogue). Missing a key = the user is denied the toggle
 * even though they could use admin features.
 */
export const ADMIN_PERMISSION_HINTS: string[] = [
  // Cross-cutting
  "employees:view_all", "employees:edit_all", "employees:invite", "employees:deactivate", "employees:change_role",
  "attendance:view_all", "attendance:approve_regularization_team", "attendance:approve_regularization_all", "attendance:manage",
  "leave:view_all", "leave:approve", "leave:manage_policies", "leave:override_balance",
  "billing:view", "billing:manage",
  "subscriptions:view", "subscriptions:manage_seats", "subscriptions:cancel", "subscriptions:add_module",
  "modules_access:view", "modules_access:manage",
  "audit:view", "audit:export",
  "roles:view", "roles:manage",
  "org_settings:view", "org_settings:manage",
  "custom_fields:view", "custom_fields:manage",
  "positions:manage",
  "org_chart:edit",
  // Per-resource manage / view_all
  "documents:manage",
  "announcements:create", "announcements:manage",
  "policies:create", "policies:manage",
  "assets:assign", "assets:manage",
  "notifications:send_org_wide",
  "helpdesk:view_all", "helpdesk:assign", "helpdesk:close", "helpdesk:manage_settings",
  "chatbot:manage_kb",
  "whistleblowing:view", "whistleblowing:assign", "whistleblowing:manage",
  "surveys:view", "surveys:create", "surveys:manage",
  "feedback:view", "feedback:respond",
  "events:create", "events:manage",
  "wellness:view_team", "wellness:view_all", "wellness:manage",
  "biometrics:view_all", "biometrics:manage_devices",
  "payroll:view_all", "payroll:run", "payroll:approve_run", "payroll:view_reports", "payroll:export",
  "salary:view_all", "salary:edit", "salary:approve_changes",
  "exit:view_all", "exit:initiate", "exit:approve", "exit:manage_settings",
  "performance:view_team", "performance:view_all", "performance:conduct_review", "performance:manage_cycles", "performance:manage_settings",
  "recruit:view", "recruit:create_job", "recruit:manage_pipeline", "recruit:hire", "recruit:manage_settings",
  "lms:assign_courses", "lms:create_course", "lms:manage_settings",
  "rewards:nominate", "rewards:approve", "rewards:manage_settings",
  "monitor:view_team", "monitor:view_all", "monitor:manage_settings",
  "field:view_team", "field:view_all", "field:manage_settings",
  "projects:create", "projects:manage_tasks", "projects:view_reports", "projects:manage_settings",
];

/**
 * Does this user have at least one admin-level permission (and therefore
 * benefit from the role-switcher)?
 */
export function hasAnyAdminPermission(permissions: Set<string>): boolean {
  for (const key of ADMIN_PERMISSION_HINTS) {
    if (permissions.has(key)) return true;
  }
  return false;
}
