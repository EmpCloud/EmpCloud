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

      <section className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-sm" aria-labelledby="payment-required-title">
        <div className="border-b border-red-200 bg-red-50 px-5 py-6 text-center dark:border-red-900 dark:bg-red-950/30 sm:px-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300">
            <ShieldAlert aria-hidden="true" className="h-6 w-6" />
          </div>
          <h1 id="payment-required-title" className="text-balance text-xl font-semibold tracking-tight text-foreground">Payment required</h1>
          <p className="mt-1.5 text-pretty text-[13px] leading-5 text-muted-foreground">
            Access for <span className="font-medium text-foreground">{user?.org_name || "your organization"}</span> is
            restricted because an invoice is overdue.
          </p>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div className="rounded-md border border-border bg-muted/40 p-3 text-[13px] leading-5 text-muted-foreground">
            {canManageBilling
              ? "Open Billing to review the overdue invoice and complete payment. Access will be restored after payment is confirmed."
              : "Please contact your organization administrator. Only an authorized billing administrator can settle the overdue invoice."}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            {canManageBilling && (
              <button
                type="button"
                onClick={() => navigate(getPaymentRestrictionDestination(user!))}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <CreditCard aria-hidden="true" className="h-4 w-4" />
                Open Billing
              </button>
            )}
            <button
              type="button"
              onClick={checkPaymentStatus}
              disabled={checking}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-[13px] font-medium text-foreground transition-colors duration-150 hover:border-brand-300 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw aria-hidden="true" className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking…" : "Check payment status"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
