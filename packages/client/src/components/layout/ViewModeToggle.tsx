// =============================================================================
// EMP CLOUD — View Mode Toggle
// Lets non-HR users with admin-level custom roles flip between their
// employee self-service sidebar and the admin sidebar.
// =============================================================================

import { useViewModeStore } from "@/lib/use-view-mode";
import { useNavigate } from "react-router-dom";
import { UserCircle, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ViewModeToggle() {
  const { t } = useTranslation();
  const viewMode = useViewModeStore((s) => s.viewMode);
  const setViewMode = useViewModeStore((s) => s.setViewMode);
  const navigate = useNavigate();

  const switchTo = (mode: "self" | "admin") => {
    if (mode === viewMode) return;
    setViewMode(mode);
    // Land on the natural home for that view so the active sidebar item
    // matches the page the user lands on.
    navigate(mode === "admin" ? "/" : "/");
  };

  return (
    <div className="inline-flex items-center rounded-md bg-muted p-0.5 text-xs">
      <button
        type="button"
        onClick={() => switchTo("self")}
        className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
          viewMode === "self"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title={t("viewModeToggle.myViewTitle")}
      >
        <UserCircle className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("viewModeToggle.myView")}</span>
      </button>
      <button
        type="button"
        onClick={() => switchTo("admin")}
        className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
          viewMode === "admin"
            ? "bg-brand-600 text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title={t("viewModeToggle.adminViewTitle")}
      >
        <Shield className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("viewModeToggle.adminView")}</span>
      </button>
    </div>
  );
}
