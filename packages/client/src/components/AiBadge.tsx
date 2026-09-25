import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AiBadge({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
      <Sparkles aria-hidden="true" className="h-3 w-3" />
      {label ?? t("aiBadge.label")}
    </span>
  );
}
