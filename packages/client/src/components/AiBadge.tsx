import { Sparkles } from "lucide-react";

export function AiBadge({ label = "AI Powered" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
      <Sparkles className="h-3 w-3" />
      {label}
    </span>
  );
}
