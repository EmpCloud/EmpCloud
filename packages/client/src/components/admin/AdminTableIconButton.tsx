import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type AdminTableIconButtonProps = Omit<ComponentProps<"button">, "aria-label" | "title"> & {
  label: string;
};

export function AdminTableIconButton({
  label,
  className,
  type = "button",
  ...props
}: AdminTableIconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
