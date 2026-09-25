import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const toneStyles = {
  blue: {
    icon: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
    wash: "from-blue-50/55 via-card to-card dark:from-blue-950/20",
    glow: "bg-blue-200/30 dark:bg-blue-800/10",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    wash: "from-emerald-50/55 via-card to-card dark:from-emerald-950/20",
    glow: "bg-emerald-200/30 dark:bg-emerald-800/10",
  },
  violet: {
    icon: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
    wash: "from-violet-50/55 via-card to-card dark:from-violet-950/20",
    glow: "bg-violet-200/30 dark:bg-violet-800/10",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    wash: "from-amber-50/55 via-card to-card dark:from-amber-950/20",
    glow: "bg-amber-200/30 dark:bg-amber-800/10",
  },
  cyan: {
    icon: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400",
    wash: "from-cyan-50/55 via-card to-card dark:from-cyan-950/20",
    glow: "bg-cyan-200/30 dark:bg-cyan-800/10",
  },
};

export type DashboardMetricCardProps = {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone: keyof typeof toneStyles;
  to?: string;
  supporting?: ReactNode;
  decoration?: ReactNode;
};

export default function DashboardMetricCard({
  label,
  value,
  icon: Icon,
  tone,
  to,
  supporting,
  decoration,
}: DashboardMetricCardProps) {
  const styles = toneStyles[tone];
  const content = (
    <>
      <span aria-hidden="true" className={cn("absolute -end-8 -top-10 h-24 w-24 rounded-full blur-2xl", styles.glow)} />
      <div className="relative flex items-center gap-3">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", styles.icon)}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold leading-6 tracking-tight text-foreground tabular-nums">
            {value}
          </div>
          <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">{label}</p>
          {supporting && <div className="mt-1 truncate text-[10px] leading-4 text-muted-foreground">{supporting}</div>}
        </div>
      </div>
      {decoration && <div aria-hidden="true" className="absolute bottom-2.5 end-3">{decoration}</div>}
    </>
  );

  const className = cn(
    "relative min-h-[88px] overflow-hidden rounded-xl border border-border bg-gradient-to-br p-3 shadow-sm",
    styles.wash,
    to && "transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
  );

  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
