import type { ReactNode } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";

type AuthPageShellProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  maxWidth?: "md" | "lg";
  className?: string;
};

export function AuthPageShell({
  title,
  description,
  children,
  maxWidth = "md",
  className,
}: AuthPageShellProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-16 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-100/55 blur-3xl dark:bg-brand-950/20" />
        <div className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-violet-100/50 blur-3xl dark:bg-violet-950/20" />
      </div>

      <div className="absolute right-4 top-4 z-10 flex items-center gap-2 sm:right-6 sm:top-6">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      <section
        className={cn(
          "relative z-10 w-full",
          maxWidth === "lg" ? "max-w-xl" : "max-w-md",
          className,
        )}
        aria-labelledby="auth-page-title"
      >
        <header className="mb-5 text-center">
          <img
            src="/empcloud-logo.png"
            alt="EMP Cloud"
            width={180}
            height={48}
            className="mx-auto h-11 w-auto"
          />
          <h1 id="auth-page-title" className="mt-4 text-balance text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description && <p className="mx-auto mt-1 max-w-md text-pretty text-[13px] text-muted-foreground">{description}</p>}
        </header>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">{children}</div>
      </section>
    </main>
  );
}
