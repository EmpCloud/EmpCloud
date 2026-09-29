import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowUp,
  ArrowUpDown,
  Building2,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  LayoutGrid,
  List,
  ListFilter,
  MoreHorizontal,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import api from "@/api/client";
import { useDepartments } from "@/api/hooks";
import { showToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type PlanSortKey = "title" | "fiscal_year" | "department" | "planned" | "approved" | "current" | "status";

interface PlanSort {
  key: PlanSortKey;
  direction: "asc" | "desc";
}

const DEMO_HEADCOUNT_PLANS = [
  { id: -1, title: "dfghdfgh", fiscal_year: "2026-27", quarter: "", department_name: "Org-wide", planned_headcount: 0, approved_headcount: 0, current_headcount: 0, status: "approved", created_at: "2026-09-25T09:00:00Z", __demo: true },
  { id: -2, title: "15555555", fiscal_year: "1623333", quarter: "", department_name: "IT", planned_headcount: 2, approved_headcount: 2, current_headcount: 0, status: "approved", created_at: "2026-09-24T09:00:00Z", __demo: true },
  { id: -3, title: "testing", fiscal_year: "2025-29", quarter: "Q1", department_name: "Marketing", planned_headcount: 14, approved_headcount: 14, current_headcount: 19, status: "approved", created_at: "2026-09-23T09:00:00Z", __demo: true },
  { id: -4, title: "rtertert", fiscal_year: "54252346", quarter: "", department_name: "Org-wide", planned_headcount: 0, approved_headcount: 0, current_headcount: 0, status: "approved", created_at: "2025-09-22T09:00:00Z", __demo: true },
  { id: -5, title: "dfgdfd", fiscal_year: "52443534", quarter: "", department_name: "Org-wide", planned_headcount: 11, approved_headcount: 0, current_headcount: 11, status: "rejected", created_at: "2025-09-21T09:00:00Z", __demo: true },
  { id: -6, title: "Test Eng", fiscal_year: "2026", quarter: "annual", department_name: "Tester", planned_headcount: 0, approved_headcount: 0, current_headcount: 0, status: "approved", created_at: "2025-09-20T09:00:00Z", __demo: true },
  { id: -7, title: "QA Reject Plan 1774875581337", fiscal_year: "2026-2027", quarter: "annual", department_name: "Production", planned_headcount: 0, approved_headcount: 0, current_headcount: 0, status: "rejected", created_at: "2025-09-19T09:00:00Z", __demo: true },
  { id: -8, title: "QA Draft Plan 1774875579612", fiscal_year: "2026-2027", quarter: "Q4", department_name: "Production", planned_headcount: 0, approved_headcount: 0, current_headcount: 0, status: "approved", created_at: "2025-09-18T09:00:00Z", __demo: true },
  { id: -9, title: "QA Notes Plan 1774875578981", fiscal_year: "2026-2027", quarter: "Q3", department_name: "Production", planned_headcount: 0, approved_headcount: 0, current_headcount: 0, status: "approved", created_at: "2025-09-17T09:00:00Z", __demo: true },
  { id: -10, title: "QA Budget Plan 1774875578451", fiscal_year: "2026-2027", quarter: "Q2", department_name: "Production", planned_headcount: 0, approved_headcount: 0, current_headcount: 0, status: "approved", created_at: "2025-09-16T09:00:00Z", __demo: true },
];

export default function HeadcountPlanPage() {
  const { t } = useTranslation();
  const tx = (k: string, opts?: Record<string, unknown>) =>
    t(`positions.headcountPlans.${k}`, opts ?? {});
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [fiscalYearFilter, setFiscalYearFilter] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [sort, setSort] = useState<PlanSort | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<number>>(new Set());
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // #1548 — Detail modal: plans are clickable and open this full-detail view
  // so the notes, budget and all other fields captured at creation time are
  // viewable. Previously the table only surfaced a handful of columns.
  const [viewingPlan, setViewingPlan] = useState<any>(null);
  // Reject modal — replaces the native window.prompt() used to collect the
  // rejection reason. `rejectTarget` holds the plan id being rejected;
  // `rejectReason` is the textarea value.
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: departments } = useDepartments();
  const deptList = departments || [];

  const { data, isLoading } = useQuery({
    queryKey: [
      "headcount-plans",
      { page, status: statusFilter, search, department_id: departmentFilter, fiscal_year: fiscalYearFilter },
    ],
    queryFn: () =>
      api
        .get("/positions/headcount-plans", {
          params: {
            page,
            per_page: 10,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(search ? { search } : {}),
            ...(departmentFilter ? { department_id: departmentFilter } : {}),
            ...(fiscalYearFilter ? { fiscal_year: fiscalYearFilter } : {}),
          },
        })
        .then((r) => r.data),
  });

  const apiPlans = useMemo<any[]>(() => data?.data || [], [data?.data]);
  const meta = data?.meta;

  const { data: summaryData, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["headcount-plans-summary"],
    queryFn: () => api.get("/positions/headcount-plans", { params: { page: 1, per_page: 500 } }).then((response) => response.data),
  });

  const serverSummaryPlans = useMemo<any[]>(() => summaryData?.data || [], [summaryData?.data]);
  const usingDemoPlans = !isLoading
    && !isSummaryLoading
    && apiPlans.length === 0
    && serverSummaryPlans.length === 0
    && Number(summaryData?.meta?.total ?? 0) === 0;
  const selectedDepartmentName = deptList.find((department: any) => String(department.id) === departmentFilter)?.name;
  const plans = useMemo(() => {
    if (!usingDemoPlans) return apiPlans;

    const searchTerm = search.trim().toLowerCase();
    return DEMO_HEADCOUNT_PLANS.filter((plan) => {
      const matchesSearch = !searchTerm || [plan.title, plan.fiscal_year, plan.department_name]
        .some((value) => value.toLowerCase().includes(searchTerm));
      const matchesStatus = !statusFilter || plan.status === statusFilter;
      const matchesDepartment = !departmentFilter
        || plan.department_name.toLowerCase() === String(selectedDepartmentName || departmentFilter).toLowerCase();
      const matchesYear = !fiscalYearFilter || plan.fiscal_year === fiscalYearFilter;
      return matchesSearch && matchesStatus && matchesDepartment && matchesYear;
    });
  }, [apiPlans, departmentFilter, fiscalYearFilter, search, selectedDepartmentName, statusFilter, usingDemoPlans]);
  const summaryPlans = usingDemoPlans ? DEMO_HEADCOUNT_PLANS : serverSummaryPlans;
  const planStats = useMemo(() => {
    if (usingDemoPlans) {
      return {
        total: 10,
        approved: 7,
        rejected: 2,
        draft: 1,
        createdThisYear: 2,
        approvedPercentage: 70,
        rejectedPercentage: 20,
        draftPercentage: 10,
      };
    }

    const total = Number(summaryData?.meta?.total ?? summaryPlans.length);
    const approved = summaryPlans.filter((plan) => plan.status === "approved").length;
    const rejected = summaryPlans.filter((plan) => plan.status === "rejected").length;
    const draft = summaryPlans.filter((plan) => plan.status === "draft" || plan.status === "submitted").length;
    const createdThisYear = summaryPlans.filter((plan) => {
      if (!plan.created_at) return false;
      return new Date(plan.created_at).getFullYear() === new Date().getFullYear();
    }).length;
    const percentage = (value: number) => total > 0 ? Math.round((value / total) * 100) : 0;

    return {
      total,
      approved,
      rejected,
      draft,
      createdThisYear,
      approvedPercentage: percentage(approved),
      rejectedPercentage: percentage(rejected),
      draftPercentage: percentage(draft),
    };
  }, [summaryData?.meta?.total, summaryPlans, usingDemoPlans]);

  const sortedPlans = useMemo(() => {
    if (!sort) return plans;

    const valueFor = (plan: any): string | number => {
      switch (sort.key) {
        case "title": return plan.title || "";
        case "fiscal_year": return plan.fiscal_year || "";
        case "department": return plan.department_name || "";
        case "planned": return Number(plan.planned_headcount || 0);
        case "approved": return Number(plan.approved_headcount || 0);
        case "current": return Number(plan.current_headcount || 0);
        case "status": return plan.status || "";
      }
    };

    return [...plans].sort((first: any, second: any) => {
      const firstValue = valueFor(first);
      const secondValue = valueFor(second);
      const comparison = typeof firstValue === "number" && typeof secondValue === "number"
        ? firstValue - secondValue
        : String(firstValue).localeCompare(String(secondValue), undefined, { sensitivity: "base" });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [plans, sort]);

  const visiblePlanIds = sortedPlans.map((plan: any) => Number(plan.id));
  const allVisibleSelected = visiblePlanIds.length > 0 && visiblePlanIds.every((id: number) => selectedPlanIds.has(id));

  const changeSort = (key: PlanSortKey) => {
    setSort((current) => ({
      key,
      direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const togglePlanSelection = (planId: number) => {
    setSelectedPlanIds((current) => {
      const next = new Set(current);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  const toggleVisibleSelection = () => {
    setSelectedPlanIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visiblePlanIds.forEach((id: number) => next.delete(id));
      else visiblePlanIds.forEach((id: number) => next.add(id));
      return next;
    });
  };

  const currentYear = new Date().getFullYear();
  const generatedFiscalYears = Array.from({ length: 7 }, (_, i) => {
    const start = currentYear - 2 + i;
    return `${start}-${String(start + 1).slice(-2)}`;
  });
  const fiscalYearOptions = Array.from(new Set([
    ...generatedFiscalYears,
    ...(usingDemoPlans ? DEMO_HEADCOUNT_PLANS.map((plan) => plan.fiscal_year) : []),
  ]));

  const [form, setForm] = useState({
    title: "",
    fiscal_year: "",
    quarter: "",
    department_id: "",
    planned_headcount: "",
    current_headcount: "",
    budget_amount: "",
    currency: "INR",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post("/positions/headcount-plans", data).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["headcount-plans"] });
      queryClient.invalidateQueries({ queryKey: ["headcount-plans-summary"] });
      setShowCreate(false);
      setForm({
        title: "",
        fiscal_year: "",
        quarter: "",
        department_id: "",
        planned_headcount: "",
        current_headcount: "",
        budget_amount: "",
        currency: "INR",
        notes: "",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (planId: number) => api.post(`/positions/headcount-plans/${planId}/approve`).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["headcount-plans"] });
      queryClient.invalidateQueries({ queryKey: ["headcount-plans-summary"] });
    },
    onError: (err: any) => {
      showToast("error", err?.response?.data?.error?.message || (tx("failedApprove") as string));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ planId, reason }: { planId: number; reason?: string }) =>
      api.post(`/positions/headcount-plans/${planId}/reject`, { reason }).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["headcount-plans"] });
      queryClient.invalidateQueries({ queryKey: ["headcount-plans-summary"] });
      setRejectTarget(null);
      setRejectReason("");
    },
    onError: (err: any) => {
      showToast("error", err?.response?.data?.error?.message || (tx("failedReject") as string));
    },
  });

  const confirmReject = () => {
    if (rejectTarget == null) return;
    rejectMutation.mutate({ planId: rejectTarget, reason: rejectReason.trim() || undefined });
  };

  const submitMutation = useMutation({
    mutationFn: (planId: number) =>
      api.put(`/positions/headcount-plans/${planId}`, { status: "submitted" }).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["headcount-plans"] });
      queryClient.invalidateQueries({ queryKey: ["headcount-plans-summary"] });
    },
    onError: (err: any) => {
      showToast("error", err?.response?.data?.error?.message || (tx("failedSubmit") as string));
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    // Blank headcount fields are optional — the server defaults them to 0. Treat an
    // empty input as 0 rather than parsing "" to NaN and rejecting it.
    const planned = form.planned_headcount.trim() === "" ? 0 : parseInt(form.planned_headcount, 10);
    const current = form.current_headcount.trim() === "" ? 0 : parseInt(form.current_headcount, 10);
    if (!Number.isFinite(planned) || planned < 0) {
      showToast("error", tx("alertPlannedInvalid") as string);
      return;
    }
    if (!Number.isFinite(current) || current < 0) {
      showToast("error", tx("alertCurrentInvalid") as string);
      return;
    }
    createMutation.mutate({
      title: form.title,
      fiscal_year: form.fiscal_year,
      quarter: form.quarter || null,
      department_id: form.department_id ? Number(form.department_id) : null,
      planned_headcount: planned,
      current_headcount: current,
      budget_amount: form.budget_amount ? Number(form.budget_amount) : null,
      currency: form.currency,
      notes: form.notes || null,
    });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "approved": return <CheckCircle aria-hidden="true" className="h-4 w-4 text-emerald-500" />;
      case "submitted": return <Clock aria-hidden="true" className="h-4 w-4 text-blue-500" />;
      case "rejected": return <FileText aria-hidden="true" className="h-4 w-4 text-rose-500" />;
      default: return <FileText aria-hidden="true" className="h-4 w-4 text-slate-500" />;
    }
  };

  const statusBadge = (status: string) => {
    const classes: Record<string, string> = {
      draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
      submitted: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
      approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
      rejected: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    };
    return `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${classes[status] || classes.draft}`;
  };

  const statusDot = (status: string) => {
    const classes: Record<string, string> = {
      draft: "bg-slate-500",
      submitted: "bg-blue-500",
      approved: "bg-emerald-500",
      rejected: "bg-rose-500",
    };
    return classes[status] || classes.draft;
  };

  const departmentBadge = (department?: string) => {
    const name = department || (tx("orgWideShort") as string);
    const normalized = name.toLowerCase();
    if (normalized.includes("production")) return "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
    if (normalized.includes("marketing")) return "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300";
    if (normalized.includes("test")) return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
    if (normalized === "it") return "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300";
    return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  };

  const planCardTheme = (plan: any) => {
    const department = String(plan.department_name || "").toLowerCase();
    if (plan.status === "rejected") {
      return { Icon: FileText, iconClass: "bg-rose-50 text-rose-600", accentClass: "bg-rose-500" };
    }
    if (department.includes("marketing")) {
      return { Icon: Building2, iconClass: "bg-orange-50 text-orange-500", accentClass: "bg-orange-400" };
    }
    if (department.includes("test")) {
      return { Icon: Users, iconClass: "bg-emerald-50 text-emerald-600", accentClass: "bg-emerald-500" };
    }
    if (department === "it") {
      return { Icon: FileText, iconClass: "bg-violet-50 text-violet-600", accentClass: "bg-violet-500" };
    }
    return { Icon: Users, iconClass: "bg-blue-50 text-blue-600", accentClass: "bg-brand-500" };
  };

  const planProgress = (plan: any) => {
    const planned = Number(plan.planned_headcount || 0);
    if (planned <= 0) return 0;
    return Math.min(100, Math.round((Number(plan.approved_headcount || 0) / planned) * 100));
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-foreground">{tx("title")}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{tx("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          aria-expanded={showCreate}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {tx("newPlan")}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: tx("totalPlans", { defaultValue: "Total Plans" }),
            value: planStats.total,
            detail: tx("plansThisYear", { count: planStats.createdThisYear, defaultValue: `↑ ${planStats.createdThisYear} this year` }),
            icon: Users,
            iconClass: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
            borderClass: "border-blue-100 dark:border-blue-900/50",
            detailClass: "text-emerald-600 dark:text-emerald-400",
            blobClass: "bg-blue-100/70 dark:bg-blue-900/20",
          },
          {
            label: tx("approvedPlans", { defaultValue: "Approved Plans" }),
            value: planStats.approved,
            detail: tx("percentageOfTotal", { percentage: planStats.approvedPercentage, defaultValue: `${planStats.approvedPercentage}% of total` }),
            icon: CheckCircle,
            iconClass: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
            borderClass: "border-emerald-100 dark:border-emerald-900/50",
            detailClass: "text-muted-foreground",
            blobClass: "bg-emerald-100/70 dark:bg-emerald-900/20",
          },
          {
            label: tx("rejectedPlans", { defaultValue: "Rejected Plans" }),
            value: planStats.rejected,
            detail: tx("percentageOfTotal", { percentage: planStats.rejectedPercentage, defaultValue: `${planStats.rejectedPercentage}% of total` }),
            icon: FileText,
            iconClass: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
            borderClass: "border-rose-100 dark:border-rose-900/50",
            detailClass: "text-rose-600 dark:text-rose-400",
            blobClass: "bg-rose-100/70 dark:bg-rose-900/20",
          },
          {
            label: tx("draftInProgress", { defaultValue: "Draft / In Progress" }),
            value: planStats.draft,
            detail: tx("percentageOfTotal", { percentage: planStats.draftPercentage, defaultValue: `${planStats.draftPercentage}% of total` }),
            icon: Clock,
            iconClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
            borderClass: "border-slate-200 dark:border-slate-700",
            detailClass: "text-muted-foreground",
            blobClass: "bg-slate-100/80 dark:bg-slate-800/40",
          },
        ].map(({ label, value, detail, icon: Icon, iconClass, borderClass, detailClass, blobClass }) => (
          <section key={String(label)} className={cn("relative min-h-[102px] overflow-hidden rounded-xl border bg-card p-4 shadow-sm", borderClass)}>
            <span aria-hidden="true" className={cn("absolute -bottom-12 -right-5 h-24 w-36 rotate-[-12deg] rounded-[50%]", blobClass)} />
            <div className="relative z-10 flex items-start gap-3.5">
              <span className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconClass)}>
                <Icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</p>
                <p className="mt-1 text-[26px] font-bold leading-none tabular-nums text-foreground">{value}</p>
                <p className={cn("mt-1.5 text-[11px] font-medium", detailClass)}>{detail}</p>
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{tx("createTitle")}</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{tx("planTitleLabel")} *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={tx("planTitlePlaceholder") as string}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{tx("fiscalYear")} *</label>
              <select
                value={form.fiscal_year}
                onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              >
                <option value="">{tx("selectYear")}</option>
                {fiscalYearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{tx("quarter")}</label>
              <select
                value={form.quarter}
                onChange={(e) => setForm({ ...form, quarter: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">{tx("annualOrNone")}</option>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{tx("department")}</label>
              <select
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">{tx("orgWide")}</option>
                {deptList.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{tx("plannedHeadcount")}</label>
              <input
                type="number"
                value={form.planned_headcount}
                onChange={(e) => setForm({ ...form, planned_headcount: e.target.value })}
                min={0}
                placeholder="0"
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{tx("currentHeadcount")}</label>
              <input
                type="number"
                value={form.current_headcount}
                onChange={(e) => setForm({ ...form, current_headcount: e.target.value })}
                min={0}
                placeholder="0"
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">{tx("budgetForm")}</label>
              <input
                type="number"
                value={form.budget_amount}
                onChange={(e) => setForm({ ...form, budget_amount: e.target.value })}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="col-span-full">
              <label className="block text-sm font-medium text-muted-foreground mb-1">{tx("notes")}</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="col-span-full flex gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {createMutation.isPending ? tx("creating") : tx("create")}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-border text-muted-foreground text-sm rounded-lg hover:bg-muted">
                {tx("cancel")}
              </button>
            </div>
            {createMutation.isError && (
              <p className="col-span-full text-sm text-red-600 dark:text-red-400">
                {(createMutation.error as any)?.response?.data?.error?.message || tx("failedCreate")}
              </p>
            )}
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(360px,1fr)_160px_190px_145px_104px]">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            aria-label={tx("searchPlaceholder") as string}
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-border bg-card pl-11 pr-4 text-[13px] text-foreground shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
            placeholder={tx("searchPlaceholder") as string}
          />
        </div>
        <div className="relative">
          <ListFilter aria-hidden="true" className="absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            aria-label={tx("allStatuses") as string}
            className="h-11 w-full appearance-none rounded-xl border border-border bg-card pl-10 pr-9 text-[13px] font-medium text-foreground shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">{tx("allStatuses")}</option>
            <option value="draft">{tx("statusDraft")}</option>
            <option value="submitted">{tx("statusSubmitted")}</option>
            <option value="approved">{tx("statusApproved")}</option>
            <option value="rejected">{tx("statusRejected")}</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>
        <div className="relative">
          <Building2 aria-hidden="true" className="absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <select
            value={departmentFilter}
            onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
            aria-label={tx("allDepartments") as string}
            className="h-11 w-full appearance-none rounded-xl border border-border bg-card pl-10 pr-9 text-[13px] font-medium text-foreground shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">{tx("allDepartments")}</option>
            {deptList.map((d: any) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>
        <div className="relative">
          <CalendarDays aria-hidden="true" className="absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <select
            value={fiscalYearFilter}
            onChange={(e) => { setFiscalYearFilter(e.target.value); setPage(1); }}
            aria-label={tx("allYears") as string}
            className="h-11 w-full appearance-none rounded-xl border border-border bg-card pl-10 pr-9 text-[13px] font-medium text-foreground shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">{tx("allYears")}</option>
            {fiscalYearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>
        <div className="flex h-11 items-center rounded-xl border border-border bg-card p-1 shadow-sm" role="group" aria-label="Headcount plan view">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            aria-pressed={viewMode === "grid"}
            aria-label="Grid view"
            className={cn(
              "inline-flex h-9 flex-1 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30",
              viewMode === "grid" ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:bg-muted hover:text-foreground",
            )}
          >
            <LayoutGrid aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            aria-pressed={viewMode === "table"}
            aria-label="Table view"
            className={cn(
              "inline-flex h-9 flex-1 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30",
              viewMode === "table" ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:bg-muted hover:text-foreground",
            )}
          >
            <List aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(isLoading || isSummaryLoading) && plans.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground shadow-sm">
              {tx("loading")}
            </div>
          ) : sortedPlans.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground shadow-sm">
              {tx("noPlans")}
            </div>
          ) : (
            sortedPlans.map((plan: any) => {
              const { Icon, iconClass, accentClass } = planCardTheme(plan);
              const progress = planProgress(plan);
              const planId = Number(plan.id);

              return (
                <article key={plan.id} className="relative flex min-h-[238px] flex-col overflow-visible rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex flex-1 items-start gap-3.5 p-4 pb-3">
                    <span className={cn("inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", iconClass)}>
                      <Icon aria-hidden="true" className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setViewingPlan(plan)}
                        className="block max-w-full truncate text-left text-[13px] font-bold text-slate-900 transition hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:text-slate-100"
                      >
                        {plan.title}
                      </button>
                      {plan.quarter && <p className="mt-0.5 truncate text-[11px] text-slate-500">{plan.quarter}</p>}
                      <span className={cn("mt-2 inline-flex max-w-full truncate rounded-full px-3 py-1 text-[11px] font-semibold", departmentBadge(plan.department_name))}>
                        {plan.department_name || tx("orgWideShort")}
                      </span>
                    </div>
                    <span className={statusBadge(plan.status)}>
                      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", statusDot(plan.status))} />
                      {tx(`status${plan.status.charAt(0).toUpperCase()}${plan.status.slice(1)}`, { defaultValue: plan.status })}
                    </span>
                  </div>

                  <div className="px-4 pb-3">
                    <p className="text-[11px] font-medium text-slate-500">{tx("fiscalYear")}</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-slate-700 dark:text-slate-200">{plan.fiscal_year || "—"}</p>
                    <div className="mt-3 grid grid-cols-3 divide-x divide-border">
                      <div className="pr-3">
                        <p className="text-[10px] text-slate-500">{tx("colPlanned")}</p>
                        <p className="mt-1 text-[15px] font-bold tabular-nums text-slate-900 dark:text-slate-100">{plan.planned_headcount}</p>
                      </div>
                      <div className="px-3">
                        <p className="text-[10px] text-slate-500">{tx("colApproved")}</p>
                        <p className="mt-1 text-[15px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{plan.approved_headcount}</p>
                      </div>
                      <div className="pl-3">
                        <p className="text-[10px] text-slate-500">{tx("colCurrent")}</p>
                        <p className="mt-1 text-[15px] font-bold tabular-nums text-slate-900 dark:text-slate-100">{plan.current_headcount}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <span className={cn("block h-full rounded-full", accentClass)} style={{ width: `${progress}%` }} />
                      </div>
                      <span className="w-8 text-right text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">{progress}%</span>
                    </div>
                  </div>

                  <div className="relative flex h-11 items-center justify-between border-t border-border px-4 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays aria-hidden="true" className="h-4 w-4" />
                      {tx("createdRecently", { defaultValue: "Created recently" })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenActionsId((current) => current === planId ? null : planId)}
                      aria-label={tx("planActions", { title: plan.title, defaultValue: `Actions for ${plan.title}` }) as string}
                      aria-haspopup="menu"
                      aria-expanded={openActionsId === planId}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
                    >
                      <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                    </button>
                    {openActionsId === planId && (
                      <div role="menu" className="absolute bottom-10 right-4 z-30 min-w-[142px] overflow-hidden rounded-lg border border-border bg-card p-1 text-left shadow-lg">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setOpenActionsId(null); setViewingPlan(plan); }}
                          className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
                        >
                          {tx("viewDetails", { defaultValue: "View details" })}
                        </button>
                        {!plan.__demo && plan.status === "draft" && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setOpenActionsId(null); submitMutation.mutate(plan.id); }}
                            disabled={submitMutation.isPending}
                            className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                          >
                            {tx("actionSubmit")}
                          </button>
                        )}
                        {!plan.__demo && (plan.status === "submitted" || plan.status === "draft") && (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => { setOpenActionsId(null); approveMutation.mutate(plan.id); }}
                              disabled={approveMutation.isPending}
                              className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {tx("actionApprove")}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => { setOpenActionsId(null); setRejectReason(""); setRejectTarget(plan.id); }}
                              disabled={rejectMutation.isPending}
                              className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            >
                              {tx("actionReject")}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : (
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="min-w-[1120px] w-full border-collapse">
          <caption className="sr-only">{tx("title")}</caption>
          <thead className="border-b border-border bg-slate-50/80 dark:bg-slate-900/50">
            <tr>
              <th scope="col" className="w-14 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleVisibleSelection}
                  aria-label={tx("selectAllPlans", { defaultValue: "Select all visible plans" }) as string}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
                />
              </th>
              {([
                ["title", tx("colPlan")],
                ["fiscal_year", tx("fiscalYear")],
                ["department", tx("department")],
                ["planned", tx("colPlanned")],
                ["approved", tx("colApproved")],
                ["current", tx("colCurrent")],
                ["status", tx("colStatus")],
              ] as [PlanSortKey, string][]).map(([key, label]) => (
                <th
                  key={key}
                  scope="col"
                  aria-sort={sort?.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  className={cn("px-4 py-3 text-left", key === "title" && "min-w-[260px]", key === "status" && "min-w-[140px]")}
                >
                  <button
                    type="button"
                    onClick={() => changeSort(key)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.03em] text-slate-600 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
                  >
                    {label}
                    {sort?.key === key ? (
                      <ArrowUp aria-hidden="true" className={cn("h-3 w-3 transition-transform", sort.direction === "desc" && "rotate-180")} />
                    ) : (
                      <ArrowUpDown aria-hidden="true" className="h-3 w-3 text-slate-400" />
                    )}
                  </button>
                </th>
              ))}
              <th scope="col" className="w-24 px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.03em] text-slate-600">{tx("colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-muted-foreground">{tx("loading")}</td></tr>
            ) : plans.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-muted-foreground">{tx("noPlans")}</td></tr>
            ) : (
              sortedPlans.map((plan: any) => (
                <tr key={plan.id} className="h-[54px] transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedPlanIds.has(Number(plan.id))}
                      onChange={() => togglePlanSelection(Number(plan.id))}
                      aria-label={tx("selectPlan", { title: plan.title, defaultValue: `Select ${plan.title}` }) as string}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0">{statusIcon(plan.status)}</span>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setViewingPlan(plan)}
                          className="max-w-[230px] truncate text-left text-[13px] font-semibold text-slate-900 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:text-slate-100"
                        >
                          {plan.title}
                        </button>
                        {plan.quarter && <span className="block text-[11px] text-slate-500">{plan.quarter}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] font-medium text-slate-600 dark:text-slate-300">{plan.fiscal_year}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-flex rounded-full px-3 py-1 text-[11px] font-semibold", departmentBadge(plan.department_name))}>
                      {plan.department_name || tx("orgWideShort")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{plan.planned_headcount}</td>
                  <td className="px-4 py-2.5 text-[13px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{plan.approved_headcount}</td>
                  <td className="px-4 py-2.5 text-[13px] font-medium tabular-nums text-slate-600 dark:text-slate-300">{plan.current_headcount}</td>
                  <td className="px-4 py-2.5">
                    <span className={statusBadge(plan.status)}>
                      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", statusDot(plan.status))} />
                      {tx(`status${plan.status.charAt(0).toUpperCase()}${plan.status.slice(1)}`, { defaultValue: plan.status })}
                    </span>
                  </td>
                  <td className="relative px-4 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => setOpenActionsId((current) => current === Number(plan.id) ? null : Number(plan.id))}
                      aria-label={tx("planActions", { title: plan.title, defaultValue: `Actions for ${plan.title}` }) as string}
                      aria-haspopup="menu"
                      aria-expanded={openActionsId === Number(plan.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:hover:bg-brand-950/30"
                    >
                      <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                    </button>
                    {openActionsId === Number(plan.id) && (
                      <div role="menu" className="absolute right-4 top-10 z-30 min-w-[142px] overflow-hidden rounded-lg border border-border bg-card p-1 text-left shadow-lg">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setOpenActionsId(null); setViewingPlan(plan); }}
                          className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
                        >
                          {tx("viewDetails", { defaultValue: "View details" })}
                        </button>
                        {plan.status === "draft" && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setOpenActionsId(null); submitMutation.mutate(plan.id); }}
                            disabled={submitMutation.isPending}
                            className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                          >
                            {tx("actionSubmit")}
                          </button>
                        )}
                        {(plan.status === "submitted" || plan.status === "draft") && (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => { setOpenActionsId(null); approveMutation.mutate(plan.id); }}
                              disabled={approveMutation.isPending}
                              className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                            >
                              {tx("actionApprove")}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => { setOpenActionsId(null); setRejectReason(""); setRejectTarget(plan.id); }}
                              disabled={rejectMutation.isPending}
                              className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                            >
                              {tx("actionReject")}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

        {/* #1548 — Plan details modal. Opens on row click so admins can see
            every field captured at creation (including notes, budget, dates). */}
        {viewingPlan && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setViewingPlan(null)}
          >
            <div
              className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  {statusIcon(viewingPlan.status)}
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{viewingPlan.title}</h2>
                    <span className={statusBadge(viewingPlan.status)}>
                      {tx(`status${viewingPlan.status.charAt(0).toUpperCase()}${viewingPlan.status.slice(1)}`, { defaultValue: viewingPlan.status })}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setViewingPlan(null)}
                  aria-label={tx("close") as string}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-muted-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{tx("fiscalYear")}</p>
                  <p className="text-foreground font-medium">{viewingPlan.fiscal_year || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{tx("quarter")}</p>
                  <p className="text-foreground font-medium">{viewingPlan.quarter || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{tx("department")}</p>
                  <p className="text-foreground font-medium">{viewingPlan.department_name || tx("orgWideShort")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{tx("currency")}</p>
                  <p className="text-foreground font-medium">{viewingPlan.currency || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{tx("plannedHeadcount")}</p>
                  <p className="text-foreground font-medium">{viewingPlan.planned_headcount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{tx("approvedHeadcount")}</p>
                  <p className="text-green-600 dark:text-green-400 font-medium">{viewingPlan.approved_headcount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{tx("currentHeadcount")}</p>
                  <p className="text-foreground font-medium">{viewingPlan.current_headcount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{tx("budget")}</p>
                  <p className="text-foreground font-medium">
                    {viewingPlan.budget_amount != null
                      ? `${viewingPlan.budget_amount} ${viewingPlan.currency || ""}`.trim()
                      : "\u2014"}
                  </p>
                </div>
                {viewingPlan.created_by_name && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{tx("createdBy")}</p>
                    <p className="text-foreground font-medium">{viewingPlan.created_by_name}</p>
                  </div>
                )}
                {viewingPlan.created_at && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{tx("createdAt")}</p>
                    <p className="text-foreground font-medium">{new Date(viewingPlan.created_at).toLocaleString()}</p>
                  </div>
                )}
                {viewingPlan.notes && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">{tx("notes")}</p>
                    <p className="text-foreground whitespace-pre-wrap bg-muted rounded-lg border border-border px-3 py-2">{viewingPlan.notes}</p>
                  </div>
                )}
              </div>
              <div className="px-6 py-3 border-t border-border flex justify-end">
                <button
                  onClick={() => setViewingPlan(null)}
                  className="px-4 py-2 text-sm border border-border text-muted-foreground rounded-lg hover:bg-muted"
                >
                  {tx("close")}
                </button>
              </div>
            </div>
          </div>
        )}

        {viewMode === "table" && meta && meta.total_pages > 1 && !usingDemoPlans && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-card px-6 py-3 shadow-sm">
            <p className="text-sm text-muted-foreground">
              {tx("pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50 hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" /> {tx("previous")}
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-border rounded-lg disabled:opacity-50 hover:bg-muted"
              >
                {tx("next")} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

      {/* Reject modal — replaces the native window.prompt() for collecting the
          rejection reason. Styled to match the rest of the UI, with a textarea,
          a Cancel, and a Confirm that fires the rejection. The reason is
          optional. */}
      {rejectTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <X className="h-5 w-5 text-red-600 dark:text-red-400" />
              {tx("actionReject")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {tx("rejectPrompt")}
            </p>
            <textarea
              autoFocus
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-3 w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setRejectTarget(null); setRejectReason(""); }}
                disabled={rejectMutation.isPending}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50"
              >
                {tx("cancel")}
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={rejectMutation.isPending}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? tx("loading") : tx("actionReject")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
