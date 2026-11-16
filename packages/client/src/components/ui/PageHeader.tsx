import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  meta?: ReactNode;
  backLink?: {
    to: string;
    label: string;
  };
  className?: string;
};

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  meta,
  backLink,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {backLink && (
          <Link
            to={backLink.to}
            className="mb-2 inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {backLink.label}
          </Link>
        )}
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-brand-600 dark:border-brand-900/60 dark:bg-brand-950/40 dark:text-brand-300"
            >
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            {description && <p className="mt-0.5 text-pretty text-[13px] text-muted-foreground">{description}</p>}
            {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">{meta}</div>}
          </div>
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </header>
  );
}
