// =============================================================================
// EMP CLOUD — React Query Hooks
// =============================================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "./client";

// --- Auth ---

export function useLogin() {
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post("/auth/login", data).then((r) => r.data.data),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (data: object) =>
      api.post("/auth/register", data).then((r) => r.data.data),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (data: { email: string }) =>
      api.post("/auth/forgot-password", data).then((r) => r.data),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: { token: string; password: string }) =>
      api.post("/auth/reset-password", data).then((r) => r.data),
  });
}

// --- Organization ---

export function useOrg() {
  return useQuery({
    queryKey: ["org"],
    queryFn: () => api.get("/organizations/me").then((r) => r.data.data),
  });
}

export function useOrgStats() {
  return useQuery({
    queryKey: ["org-stats"],
    queryFn: () => api.get("/organizations/me/stats").then((r) => r.data.data),
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get("/organizations/me/departments").then((r) => r.data.data),
  });
}

export function useLocations() {
  return useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get("/organizations/me/locations").then((r) => r.data.data),
  });
}

// --- Users ---

export function useUsers(params?: { page?: number; search?: string; per_page?: number }) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => api.get("/users", { params }).then((r) => r.data),
  });
}

export function useUser(id: number) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => api.get(`/users/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => api.post("/users", data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => api.post("/users/invite", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["pending-invitations"] });
    },
  });
}

// --- Modules ---

export function useModules() {
  // #1493 — include the active i18n language in the queryKey so that switching
  // language invalidates the cached list and re-renders the consumers. Reading
  // from useTranslation().i18n.language makes this reactive: when the language
  // switcher calls i18n.changeLanguage() the consuming component re-renders
  // with a new queryKey and React Query fetches fresh data.
  const { i18n } = useTranslation();
  const lang = i18n.language || "en";
  return useQuery({
    queryKey: ["modules", lang],
    queryFn: () =>
      api
        .get("/modules", { headers: { "Accept-Language": lang } })
        .then((r) => r.data.data),
  });
}

// --- Subscriptions ---

export function useSubscriptions() {
  return useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => api.get("/subscriptions").then((r) => r.data.data),
  });
}

export function useBillingSummary() {
  return useQuery({
    queryKey: ["billing-summary"],
    queryFn: () => api.get("/subscriptions/billing-summary").then((r) => r.data.data),
  });
}

export function useCreateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => api.post("/subscriptions", data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}

export function useUpdateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      api.put(`/subscriptions/${id}`, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["billing-summary"] });
    },
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/subscriptions/${id}`).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["billing-summary"] });
    },
  });
}

export function useAssignSeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: number; module_id: number }) =>
      api.post("/subscriptions/assign-seat", data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}

// --- Dashboard Widgets ---

export function useDashboardWidgets() {
  return useQuery({
    queryKey: ["dashboard-widgets"],
    queryFn: () => api.get("/dashboard/widgets").then((r) => r.data.data),
    refetchInterval: 5 * 60 * 1000, // refresh every 5 minutes
    staleTime: 4 * 60 * 1000,
  });
}

// --- Billing ---

export function useBillingInvoices(params?: { page?: number; per_page?: number }) {
  return useQuery({
    queryKey: ["billing-invoices", params],
    queryFn: () => api.get("/billing/invoices", { params }).then((r) => r.data),
  });
}

export function useBillingPayments(params?: { page?: number; per_page?: number }) {
  return useQuery({
    queryKey: ["billing-payments", params],
    queryFn: () => api.get("/billing/payments", { params }).then((r) => r.data),
  });
}

export function useBillingOverviewSummary() {
  return useQuery({
    queryKey: ["billing-overview-summary"],
    queryFn: () => api.get("/billing/summary").then((r) => r.data.data),
  });
}

// --- Audit ---

export function useAuditLogs(params?: { page?: number; action?: string; start_date?: string; end_date?: string }) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => api.get("/audit", { params }).then((r) => r.data),
  });
}

// --- Onboarding ---

export function useOnboardingStatus() {
  return useQuery({
    queryKey: ["onboarding-status"],
    queryFn: () => api.get("/onboarding/status").then((r) => r.data.data),
  });
}

export function useCompleteOnboardingStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ step, data }: { step: number; data: object }) =>
      api.post(`/onboarding/step/${step}`, data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-status"] }),
  });
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/onboarding/complete").then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-status"] }),
  });
}

export function useSkipOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/onboarding/skip").then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-status"] }),
  });
}
