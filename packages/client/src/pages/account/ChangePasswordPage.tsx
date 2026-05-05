// =============================================================================
// EMP CLOUD — Standalone Change Password page
//
// Accessible to ALL signed-in users (employee, HR, admin) — unlike the HR
// /settings page which gates org-level configuration. Wraps the shared
// ChangePasswordCard with a page header so the route doesn't feel orphaned
// when navigated to directly.
// =============================================================================

import ChangePasswordCard from "@/components/ChangePasswordCard";

export default function ChangePasswordPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Account Security</h1>
        <p className="text-gray-500 mt-1">
          Update the password you use to sign in to EmpCloud.
        </p>
      </div>
      <ChangePasswordCard />
    </div>
  );
}
