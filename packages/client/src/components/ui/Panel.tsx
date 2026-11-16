import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PanelProps = {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ElementType;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
  bodyClassName?: string;
};

export function Panel({
  title,
  description,
  icon: Icon,
  action,
  children,
  id,
  className,
  bodyClassName,
}: PanelProps) {
  const hasHeader = title || description || action;

  return (
    <section
      id={id}
      className={cn("scroll-mt-4 overflow-hidden rounded-lg border border-border bg-card", className)}
    >
      {hasHeader && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="flex min-w-0 items-start gap-2">
            {Icon && <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />}
            <div className="min-w-0">
              {title && (
                <h2 className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {title}
                </h2>
              )}
              {description && <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}
