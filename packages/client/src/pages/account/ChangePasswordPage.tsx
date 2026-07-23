// =============================================================================
// EMP CLOUD — Standalone Change Password page
//
// Accessible to ALL signed-in users (employee, HR, admin) — unlike the HR
// /settings page which gates org-level configuration. Wraps the shared
// ChangePasswordCard with a page header so the route doesn't feel orphaned
// when navigated to directly.
// =============================================================================

import { useTranslation } from "react-i18next";
import ChangePasswordCard from "@/components/ChangePasswordCard";

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("accountSecurity.title")}</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">{t("accountSecurity.subtitle")}</p>
      </div>
      <ChangePasswordCard />
    </div>
  );
}
