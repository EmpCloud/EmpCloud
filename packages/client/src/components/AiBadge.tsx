import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AiBadge({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
      <Sparkles className="h-3 w-3" />
      {label ?? t("aiBadge.label")}
    </span>
  );
}
