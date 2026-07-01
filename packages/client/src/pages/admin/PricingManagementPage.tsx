import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { showToast } from "@/components/ui/Toast";
const toast = { success: (m: string) => showToast("success", m), error: (m: string) => showToast("error", m) };
import {
  Plus,
  Pencil,
  Trash2,
  Tag,
  Coins,
  CalendarClock,
  Layers,
  Loader2,
  X,
  CalendarDays,
} from "lucide-react";

// Pricing Management
// ------------------
// Super-admin-only page that drives:
//   - plan_tiers      (custom tier creation, edit, deactivate)
//   - plan_pricing    (one row per currency x tier x volume band x effective_from)
//
// The "Pricing rows" table shows every band; admins can add a row for
// (tier, currency, min_seats..max_seats, price, effective_from) to ship
// volume discounts or schedule future price changes. Existing org
// subscriptions are NOT affected -- price_per_seat is denormalised onto
// each subscription at creation time, so changes here apply to NEW
// subscriptions / plan upgrades only.

type Tier = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

type PricingRow = {
  id: number;
  tier_id: number;
  tier_slug: string;
  tier_name: string;
  currency: string;
  price_per_seat: number;
  min_seats: number;
  max_seats: number | null;
  effective_from: string;
  notes: string | null;
  updated_at: string;
};

type BillingCycle = {
  id: number;
  cycle: string;
  label: string;
  discount_pct: number;
  months_in_cycle: number;
  sort_order: number;
  is_active: boolean;
  override_amount_per_seat: number | null;
  override_currency: string | null;
};

const CURRENCIES = ["INR", "USD", "GBP", "EUR"] as const;

function formatPrice(amount: number, currency: string): string {
  // Amount is in smallest unit (paise / cents / pence).
  const major = amount / 100;
  const sym: Record<string, string> = { INR: "₹", USD: "$", GBP: "£", EUR: "€" };
  return `${sym[currency] || currency} ${major.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PricingManagementPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const tiersQ = useQuery<{ data: Tier[] }>({
    queryKey: ["admin-pricing-tiers"],
    queryFn: () => api.get("/admin/pricing/tiers").then((r) => r.data),
  });
  const pricingQ = useQuery<{ data: PricingRow[] }>({
    queryKey: ["admin-pricing-rows"],
    queryFn: () => api.get("/admin/pricing/rows").then((r) => r.data),
  });

  const cyclesQ = useQuery<{ data: BillingCycle[] }>({
    queryKey: ["admin-billing-cycles"],
    queryFn: () => api.get("/admin/pricing/billing-cycles").then((r) => r.data),
  });

  const tiers = tiersQ.data?.data ?? [];
  const pricing = pricingQ.data?.data ?? [];
  const cycles = cyclesQ.data?.data ?? [];

  // -------- Tier modal --------
  const [tierModal, setTierModal] = useState<null | {
    mode: "create" | "edit";
    row?: Tier;
  }>(null);
  const [tierForm, setTierForm] = useState({
    slug: "",
    name: "",
    description: "",
    sort_order: 0,
    is_active: true,
  });

  function openCreateTier() {
    setTierForm({ slug: "", name: "", description: "", sort_order: 100, is_active: true });
    setTierModal({ mode: "create" });
  }
  function openEditTier(tier: Tier) {
    setTierForm({
      slug: tier.slug,
      name: tier.name,
      description: tier.description || "",
      sort_order: tier.sort_order,
      is_active: tier.is_active,
    });
    setTierModal({ mode: "edit", row: tier });
  }

  const tierMutation = useMutation({
    mutationFn: async () => {
      if (tierModal?.mode === "create") {
        return api.post("/admin/pricing/tiers", tierForm).then((r) => r.data);
      }
      return api.put(`/admin/pricing/tiers/${tierModal!.row!.id}`, tierForm).then((r) => r.data);
    },
    onSuccess: () => {
      toast.success(tierModal?.mode === "create" ? t("pricingManagement.toast.tierCreated") : t("pricingManagement.toast.tierUpdated"));
      setTierModal(null);
      qc.invalidateQueries({ queryKey: ["admin-pricing-tiers"] });
      qc.invalidateQueries({ queryKey: ["admin-pricing-rows"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || err?.message || t("pricingManagement.toast.failed"));
    },
  });

  const deleteTier = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/admin/pricing/tiers/${id}`).then((r) => r.data),
    onSuccess: () => {
      toast.success(t("pricingManagement.toast.tierDeleted"));
      qc.invalidateQueries({ queryKey: ["admin-pricing-tiers"] });
      qc.invalidateQueries({ queryKey: ["admin-pricing-rows"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || err?.message || t("pricingManagement.toast.failed"));
    },
  });

  // -------- Pricing row modal --------
  const [priceModal, setPriceModal] = useState<null | {
    mode: "create" | "edit";
    row?: PricingRow;
  }>(null);
  const [priceForm, setPriceForm] = useState({
    tier_id: 0,
    currency: "INR",
    price_per_seat_major: "0", // major unit input (₹/$ etc.); converted to minor on submit
    min_seats: 1,
    max_seats: "" as string | number,
    effective_from: "1970-01-01",
    notes: "",
  });

  function openCreatePrice() {
    setPriceForm({
      tier_id: tiers[0]?.id ?? 0,
      currency: "INR",
      price_per_seat_major: "0",
      min_seats: 1,
      max_seats: "",
      effective_from: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    setPriceModal({ mode: "create" });
  }
  function openEditPrice(p: PricingRow) {
    setPriceForm({
      tier_id: p.tier_id,
      currency: p.currency,
      price_per_seat_major: String(p.price_per_seat / 100),
      min_seats: p.min_seats,
      max_seats: p.max_seats == null ? "" : p.max_seats,
      effective_from: p.effective_from.slice(0, 10),
      notes: p.notes || "",
    });
    setPriceModal({ mode: "edit", row: p });
  }

  const priceMutation = useMutation({
    mutationFn: async () => {
      const minor = Math.round(Number(priceForm.price_per_seat_major) * 100);
      const body: any = {
        tier_id: priceForm.tier_id,
        currency: priceForm.currency,
        price_per_seat: minor,
        min_seats: Number(priceForm.min_seats) || 1,
        max_seats: priceForm.max_seats === "" ? null : Number(priceForm.max_seats),
        effective_from: priceForm.effective_from,
        notes: priceForm.notes || null,
      };
      if (priceModal?.mode === "create") {
        return api.post("/admin/pricing/rows", body).then((r) => r.data);
      }
      return api
        .put(`/admin/pricing/rows/${priceModal!.row!.id}`, body)
        .then((r) => r.data);
    },
    onSuccess: () => {
      toast.success(priceModal?.mode === "create" ? t("pricingManagement.toast.priceAdded") : t("pricingManagement.toast.priceUpdated"));
      setPriceModal(null);
      qc.invalidateQueries({ queryKey: ["admin-pricing-rows"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || err?.message || t("pricingManagement.toast.failed"));
    },
  });

  const deletePrice = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/admin/pricing/rows/${id}`).then((r) => r.data),
    onSuccess: () => {
      toast.success(t("pricingManagement.toast.priceDeleted"));
      qc.invalidateQueries({ queryKey: ["admin-pricing-rows"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message || err?.message || t("pricingManagement.toast.failed"));
    },
  });

  // -------- Billing cycle modal --------
  const [cycleModal, setCycleModal] = useState<null | { mode: "create" | "edit"; row?: BillingCycle }>(null);
  const [cycleForm, setCycleForm] = useState({
    cycle: "",
    label: "",
    discount_pct: 0,
    months_in_cycle: 1,
    sort_order: 0,
    is_active: true,
    override_amount_major: "" as string, // major unit input
    override_currency: "" as string,
  });

  function openCycleModal(c?: BillingCycle) {
    if (c) {
      setCycleForm({
        cycle: c.cycle,
        label: c.label,
        discount_pct: Number(c.discount_pct),
        months_in_cycle: c.months_in_cycle,
        sort_order: c.sort_order,
        is_active: c.is_active,
        override_amount_major:
          c.override_amount_per_seat == null ? "" : String(c.override_amount_per_seat / 100),
        override_currency: c.override_currency || "",
      });
      setCycleModal({ mode: "edit", row: c });
    } else {
      setCycleForm({
        cycle: "",
        label: "",
        discount_pct: 0,
        months_in_cycle: 1,
        sort_order: 100,
        is_active: true,
        override_amount_major: "",
        override_currency: "",
      });
      setCycleModal({ mode: "create" });
    }
  }

  const cycleMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        cycle: cycleForm.cycle,
        label: cycleForm.label,
        discount_pct: cycleForm.discount_pct,
        months_in_cycle: cycleForm.months_in_cycle,
        sort_order: cycleForm.sort_order,
        is_active: cycleForm.is_active,
        // Convert major -> smallest unit. Treat empty input OR a literal 0
        // as "no override" -- a 0 override would silently force the cycle
        // total to ₹0 (the modal then displays "₹0/mo"). If the admin
        // genuinely wants a free cycle they should set the tier to free
        // instead.
        override_amount_per_seat:
          cycleForm.override_amount_major === "" ||
          cycleForm.override_currency === "" ||
          Number(cycleForm.override_amount_major) <= 0
            ? null
            : Math.round(Number(cycleForm.override_amount_major) * 100),
        override_currency:
          cycleForm.override_amount_major === "" ||
          cycleForm.override_currency === "" ||
          Number(cycleForm.override_amount_major) <= 0
            ? null
            : cycleForm.override_currency.toUpperCase(),
      };
      if (cycleModal?.mode === "create") {
        return api.post("/admin/pricing/billing-cycles", body).then((r) => r.data);
      }
      return api
        .put(`/admin/pricing/billing-cycles/${cycleModal!.row!.id}`, body)
        .then((r) => r.data);
    },
    onSuccess: () => {
      toast.success(cycleModal?.mode === "create" ? t("pricingManagement.toast.cycleCreated") : t("pricingManagement.toast.cycleUpdated"));
      setCycleModal(null);
      qc.invalidateQueries({ queryKey: ["admin-billing-cycles"] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message || err?.message || t("pricingManagement.toast.failed")),
  });

  const deleteCycle = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/pricing/billing-cycles/${id}`).then((r) => r.data),
    onSuccess: () => {
      toast.success(t("pricingManagement.toast.cycleDeleted"));
      qc.invalidateQueries({ queryKey: ["admin-billing-cycles"] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message || err?.message || t("pricingManagement.toast.failed")),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("pricingManagement.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("pricingManagement.subtitle")}
          </p>
        </div>
      </div>

      {/* ---------- Tiers ---------- */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <Tag className="h-5 w-5 text-brand-600" /> {t("pricingManagement.tiers.heading")}
          </h2>
          <button
            onClick={openCreateTier}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t("pricingManagement.tiers.add")}
          </button>
        </div>
        {tiersQ.isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("pricingManagement.loading")}
          </div>
        ) : tiers.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">{t("pricingManagement.tiers.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left">{t("pricingManagement.tiers.col.slug")}</th>
                  <th className="px-3 py-2 text-left">{t("pricingManagement.tiers.col.name")}</th>
                  <th className="px-3 py-2 text-left">{t("pricingManagement.tiers.col.description")}</th>
                  <th className="px-3 py-2 text-right">{t("pricingManagement.tiers.col.sort")}</th>
                  <th className="px-3 py-2 text-center">{t("pricingManagement.tiers.col.active")}</th>
                  <th className="px-3 py-2 text-right">{t("pricingManagement.tiers.col.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {tiers.map((tier) => (
                  <tr key={tier.id}>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">{tier.slug}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{tier.name}</td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{tier.description}</td>
                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{tier.sort_order}</td>
                    <td className="px-3 py-2 text-center">
                      {tier.is_active ? (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                          {t("pricingManagement.status.active")}
                        </span>
                      ) : (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{t("pricingManagement.status.inactive")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => openEditTier(tier)}
                        className="text-gray-500 hover:text-gray-700 mr-2"
                        title={t("pricingManagement.actions.edit")}
                      >
                        <Pencil className="h-4 w-4 inline" />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(t("pricingManagement.tiers.deleteConfirm", { name: tier.name, slug: tier.slug })))
                            deleteTier.mutate(tier.id);
                        }}
                        className="text-red-500 hover:text-red-700"
                        title={t("pricingManagement.actions.delete")}
                      >
                        <Trash2 className="h-4 w-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- Pricing rows ---------- */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <Coins className="h-5 w-5 text-brand-600" /> {t("pricingManagement.pricingRows.heading")}
          </h2>
          <button
            onClick={openCreatePrice}
            disabled={tiers.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {t("pricingManagement.pricingRows.add")}
          </button>
        </div>
        {pricingQ.isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("pricingManagement.loading")}
          </div>
        ) : pricing.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">{t("pricingManagement.pricingRows.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left">{t("pricingManagement.pricingRows.col.tier")}</th>
                  <th className="px-3 py-2 text-left">{t("pricingManagement.pricingRows.col.currency")}</th>
                  <th className="px-3 py-2 text-right">{t("pricingManagement.pricingRows.col.pricePerSeat")}</th>
                  <th className="px-3 py-2 text-left">{t("pricingManagement.pricingRows.col.seatBand")}</th>
                  <th className="px-3 py-2 text-left">{t("pricingManagement.pricingRows.col.effectiveFrom")}</th>
                  <th className="px-3 py-2 text-left">{t("pricingManagement.pricingRows.col.notes")}</th>
                  <th className="px-3 py-2 text-right">{t("pricingManagement.pricingRows.col.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pricing.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                      {p.tier_name}{" "}
                      <span className="text-xs text-gray-500 font-mono">({p.tier_slug})</span>
                    </td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{p.currency}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatPrice(p.price_per_seat, p.currency)}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                      <Layers className="h-3 w-3 inline mr-1 text-gray-400" />
                      {p.min_seats} – {p.max_seats == null ? "∞" : p.max_seats}
                    </td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                      <CalendarClock className="h-3 w-3 inline mr-1 text-gray-400" />
                      {p.effective_from.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">{p.notes}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => openEditPrice(p)}
                        className="text-gray-500 hover:text-gray-700 mr-2"
                        title={t("pricingManagement.actions.edit")}
                      >
                        <Pencil className="h-4 w-4 inline" />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(t("pricingManagement.pricingRows.deleteConfirm"))) deletePrice.mutate(p.id);
                        }}
                        className="text-red-500 hover:text-red-700"
                        title={t("pricingManagement.actions.delete")}
                      >
                        <Trash2 className="h-4 w-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- Billing cycles ---------- */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <CalendarDays className="h-5 w-5 text-brand-600" /> {t("pricingManagement.billingCycles.heading")}
          </h2>
          <button
            onClick={() => openCycleModal()}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> {t("pricingManagement.billingCycles.add")}
          </button>
        </div>
        {cyclesQ.isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("pricingManagement.loading")}
          </div>
        ) : cycles.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">{t("pricingManagement.billingCycles.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left">{t("pricingManagement.billingCycles.col.cycle")}</th>
                  <th className="px-3 py-2 text-left">{t("pricingManagement.billingCycles.col.label")}</th>
                  <th className="px-3 py-2 text-right">{t("pricingManagement.billingCycles.col.discount")}</th>
                  <th className="px-3 py-2 text-right">{t("pricingManagement.billingCycles.col.months")}</th>
                  <th className="px-3 py-2 text-center">{t("pricingManagement.billingCycles.col.active")}</th>
                  <th className="px-3 py-2 text-right">{t("pricingManagement.billingCycles.col.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {cycles.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">{c.cycle}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{c.label}</td>
                    <td className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-300">
                      {c.override_amount_per_seat != null && c.override_currency ? (
                        <span className="font-mono text-purple-700 dark:text-purple-300">
                          {t("pricingManagement.billingCycles.flat", { currency: c.override_currency, amount: (c.override_amount_per_seat / 100).toFixed(2) })}
                        </span>
                      ) : Number(c.discount_pct) > 0 ? (
                        t("pricingManagement.billingCycles.save", { percent: Number(c.discount_pct) })
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{c.months_in_cycle}</td>
                    <td className="px-3 py-2 text-center">
                      {c.is_active ? (
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{t("pricingManagement.status.active")}</span>
                      ) : (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{t("pricingManagement.status.inactive")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => openCycleModal(c)}
                        className="text-gray-500 hover:text-gray-700 mr-2"
                        title={t("pricingManagement.actions.edit")}
                      >
                        <Pencil className="h-4 w-4 inline" />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(t("pricingManagement.billingCycles.deleteConfirm", { cycle: c.cycle }))) deleteCycle.mutate(c.id);
                        }}
                        className="text-red-500 hover:text-red-700"
                        title={t("pricingManagement.actions.delete")}
                      >
                        <Trash2 className="h-4 w-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tier modal */}
      {tierModal && (
        <Modal
          title={tierModal.mode === "create" ? t("pricingManagement.tierModal.addTitle") : t("pricingManagement.tierModal.editTitle", { name: tierModal.row!.name })}
          onClose={() => (tierMutation.isPending ? null : setTierModal(null))}
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.tierModal.field.slug")}</label>
              <input
                value={tierForm.slug}
                onChange={(e) => setTierForm({ ...tierForm, slug: e.target.value.toLowerCase() })}
                placeholder={t("pricingManagement.tierModal.field.slugPlaceholder")}
                disabled={tierModal.mode === "edit"}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-100"
              />
              <p className="mt-1 text-xs text-gray-500">
                {t("pricingManagement.tierModal.field.slugHelp")}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.tierModal.field.name")}</label>
              <input
                value={tierForm.name}
                onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
                placeholder={t("pricingManagement.tierModal.field.namePlaceholder")}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.tierModal.field.description")}</label>
              <textarea
                value={tierForm.description}
                rows={2}
                onChange={(e) => setTierForm({ ...tierForm, description: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.tierModal.field.sortOrder")}</label>
                <input
                  type="number"
                  value={tierForm.sort_order}
                  onChange={(e) =>
                    setTierForm({ ...tierForm, sort_order: Number(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tierForm.is_active}
                    onChange={(e) => setTierForm({ ...tierForm, is_active: e.target.checked })}
                  />
                  {t("pricingManagement.tierModal.field.active")}
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setTierModal(null)}
                disabled={tierMutation.isPending}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                {t("pricingManagement.actions.cancel")}
              </button>
              <button
                onClick={() => tierMutation.mutate()}
                disabled={tierMutation.isPending}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                {tierMutation.isPending ? t("pricingManagement.actions.saving") : t("pricingManagement.actions.save")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Pricing row modal */}
      {priceModal && (
        <Modal
          title={priceModal.mode === "create" ? t("pricingManagement.priceModal.addTitle") : t("pricingManagement.priceModal.editTitle")}
          onClose={() => (priceMutation.isPending ? null : setPriceModal(null))}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.priceModal.field.tier")}</label>
                <select
                  value={priceForm.tier_id}
                  onChange={(e) => setPriceForm({ ...priceForm, tier_id: Number(e.target.value) })}
                  disabled={priceModal.mode === "edit"}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-100"
                >
                  {tiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>{tier.name} ({tier.slug})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.priceModal.field.currency")}</label>
                <select
                  value={priceForm.currency}
                  onChange={(e) => setPriceForm({ ...priceForm, currency: e.target.value })}
                  disabled={priceModal.mode === "edit"}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-100"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                {t("pricingManagement.priceModal.field.pricePerSeat")}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={priceForm.price_per_seat_major}
                onChange={(e) => setPriceForm({ ...priceForm, price_per_seat_major: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.priceModal.field.minSeats")}</label>
                <input
                  type="number"
                  min={1}
                  value={priceForm.min_seats}
                  onChange={(e) => setPriceForm({ ...priceForm, min_seats: Number(e.target.value) || 1 })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.priceModal.field.maxSeats")}</label>
                <input
                  type="number"
                  min={1}
                  value={priceForm.max_seats}
                  onChange={(e) => setPriceForm({ ...priceForm, max_seats: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.priceModal.field.effectiveFrom")}</label>
              <input
                type="date"
                value={priceForm.effective_from}
                onChange={(e) => setPriceForm({ ...priceForm, effective_from: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                {t("pricingManagement.priceModal.field.effectiveFromHelp")}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.priceModal.field.notes")}</label>
              <input
                value={priceForm.notes}
                onChange={(e) => setPriceForm({ ...priceForm, notes: e.target.value })}
                placeholder={t("pricingManagement.priceModal.field.notesPlaceholder")}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPriceModal(null)}
                disabled={priceMutation.isPending}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                {t("pricingManagement.actions.cancel")}
              </button>
              <button
                onClick={() => priceMutation.mutate()}
                disabled={priceMutation.isPending}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                {priceMutation.isPending ? t("pricingManagement.actions.saving") : t("pricingManagement.actions.save")}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {/* Billing cycle modal */}
      {cycleModal && (
        <Modal
          title={cycleModal.mode === "create" ? t("pricingManagement.cycleModal.addTitle") : t("pricingManagement.cycleModal.editTitle", { cycle: cycleModal.row!.cycle })}
          onClose={() => (cycleMutation.isPending ? null : setCycleModal(null))}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.cycleModal.field.cycleSlug")}</label>
                <input
                  value={cycleForm.cycle}
                  onChange={(e) => setCycleForm({ ...cycleForm, cycle: e.target.value.toLowerCase() })}
                  placeholder={t("pricingManagement.cycleModal.field.cycleSlugPlaceholder")}
                  disabled={cycleModal.mode === "edit"}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.cycleModal.field.label")}</label>
                <input
                  value={cycleForm.label}
                  onChange={(e) => setCycleForm({ ...cycleForm, label: e.target.value })}
                  placeholder={t("pricingManagement.cycleModal.field.labelPlaceholder")}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.cycleModal.field.discountPct")}</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={cycleForm.discount_pct}
                  onChange={(e) => setCycleForm({ ...cycleForm, discount_pct: Number(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">{t("pricingManagement.cycleModal.field.discountPctHelp")}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.cycleModal.field.monthsPerCycle")}</label>
                <input
                  type="number"
                  min={1}
                  value={cycleForm.months_in_cycle}
                  onChange={(e) => setCycleForm({ ...cycleForm, months_in_cycle: Number(e.target.value) || 1 })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.cycleModal.field.sortOrder")}</label>
                <input
                  type="number"
                  value={cycleForm.sort_order}
                  onChange={(e) => setCycleForm({ ...cycleForm, sort_order: Number(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={cycleForm.is_active}
                    onChange={(e) => setCycleForm({ ...cycleForm, is_active: e.target.checked })}
                  />
                  {t("pricingManagement.cycleModal.field.active")}
                </label>
              </div>
            </div>

            {/* Flat-amount override: overrides the discount math entirely
                for one currency. Useful when the price sheet quotes the
                annual / quarterly total directly instead of a discount %. */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("pricingManagement.cycleModal.override.heading")}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {t("pricingManagement.cycleModal.override.help")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {t("pricingManagement.cycleModal.override.amount")}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={cycleForm.override_amount_major}
                    onChange={(e) =>
                      setCycleForm({ ...cycleForm, override_amount_major: e.target.value })
                    }
                    placeholder={t("pricingManagement.cycleModal.override.amountPlaceholder")}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t("pricingManagement.cycleModal.override.currency")}</label>
                  <select
                    value={cycleForm.override_currency}
                    onChange={(e) =>
                      setCycleForm({ ...cycleForm, override_currency: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="">{t("pricingManagement.cycleModal.override.currencyNone")}</option>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCycleModal(null)}
                disabled={cycleMutation.isPending}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                {t("pricingManagement.actions.cancel")}
              </button>
              <button
                onClick={() => cycleMutation.mutate()}
                disabled={cycleMutation.isPending}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                {cycleMutation.isPending ? t("pricingManagement.actions.saving") : t("pricingManagement.actions.save")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
