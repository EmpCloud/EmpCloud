// =============================================================================
// EMP CLOUD — React Query Hooks
// =============================================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

export function useUsers(params?: { page?: number; search?: string }) {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

// --- Modules ---

export function useModules() {
  return useQuery({
    queryKey: ["modules"],
    queryFn: () => api.get("/modules").then((r) => r.data.data),
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

// --- Audit ---

export function useAuditLogs(params?: { page?: number; action?: string }) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => api.get("/audit", { params }).then((r) => r.data),
  });
}
