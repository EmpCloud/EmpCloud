import type { ReactNode } from "react";
import { Building2 } from "lucide-react";

type AdminOrganizationGroupHeaderProps = {
  name: string;
  organizationId: string | number | null;
  email: string | null;
  meta?: string | null;
  countLabel: string;
  trailing?: ReactNode;
};

export function AdminOrganizationGroupHeader({
  name,
  organizationId,
  email,
  meta,
  countLabel,
  trailing,
}: AdminOrganizationGroupHeaderProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-950/50 dark:text-brand-300">
          <Building2 className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="min-w-0 [overflow-wrap:anywhere] text-sm font-semibold text-foreground">
              {name}
            </h2>
            {organizationId != null ? (
              <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-normal text-muted-foreground">
                #{organizationId}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 [overflow-wrap:anywhere] text-xs font-normal text-muted-foreground">
            {email || meta || "—"}
            {email && meta ? ` · ${meta}` : ""}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground shadow-sm">
          {countLabel}
        </span>
      </div>
    </div>
  );
}
