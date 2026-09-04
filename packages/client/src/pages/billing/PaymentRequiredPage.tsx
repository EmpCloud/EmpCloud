import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import api from "@/api/client";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { showToast } from "@/components/ui/Toast";
import { useAuthStore } from "@/lib/auth-store";
import { getPaymentRestrictionDestination } from "@/lib/organization-access";

export default function PaymentRequiredPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const setPaymentRestriction = useAuthStore((state) => state.setPaymentRestriction);
  const [checking, setChecking] = useState(false);

  const canManageBilling = user?.role === "org_admin";

  async function checkPaymentStatus() {
    setChecking(true);
    try {
      const response = await api.get("/auth/access-status");
      const restricted = Boolean(response.data?.data?.payment_restricted);
      setPaymentRestriction(restricted);
      if (restricted) {
        showToast("info", "The overdue payment is still pending.");
      } else {
        showToast("success", "Payment confirmed. Organization access has been restored.");
        navigate("/", { replace: true });
      }
    } catch (error: any) {
      showToast(
        "error",
        error?.response?.data?.error?.message || "Could not check payment status. Please try again.",
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <section className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="border-b border-red-200 bg-red-50 px-7 py-8 text-center dark:border-red-900 dark:bg-red-950/30">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Payment required</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Access for <span className="font-medium text-foreground">{user?.org_name || "your organization"}</span> is
            restricted because an invoice is overdue.
          </p>
        </div>

        <div className="space-y-5 px-7 py-7">
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            {canManageBilling
              ? "Open Billing to review the overdue invoice and complete payment. Access will be restored after payment is confirmed."
              : "Please contact your organization administrator. Only an authorized billing administrator can settle the overdue invoice."}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            {canManageBilling && (
              <button
                type="button"
                onClick={() => navigate(getPaymentRestrictionDestination(user!))}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                <CreditCard className="h-4 w-4" />
                Open Billing
              </button>
            )}
            <button
              type="button"
              onClick={checkPaymentStatus}
              disabled={checking}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking…" : "Check payment status"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="inline-flex w-full items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
