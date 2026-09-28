import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUp,
  ArrowUpDown,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  LayoutGrid,
  List,
  MoreVertical,
  Plus,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import api from "@/api/client";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { showToast } from "@/components/ui/Toast";

interface PendingConfirm {
  id: number;
  title: string;
}

type VacancySortKey = "title" | "code" | "department" | "type" | "openings" | "filled" | "status";

interface VacancySort {
  key: VacancySortKey;
  direction: "asc" | "desc";
}

const getFilledCount = (position: any) => Number(
  position.headcount_filled
    ?? Math.max(0, Number(position.headcount_budget || 0) - Number(position.open_count || 0)),
);

export default function VacanciesPage() {
  const { t } = useTranslation();
  const tx = (key: string, options?: Record<string, unknown>) =>
    t(`positions.vacancies.${key}`, options ?? {});
  const listTx = (key: string, options?: Record<string, unknown>) =>
    t(`positions.list.${key}`, options ?? {});
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<VacancySort>({ key: "title", direction: "asc" });

  const { data, isLoading } = useQuery({
    queryKey: ["position-vacancies"],
    queryFn: () => api.get("/positions/vacancies").then((response) => response.data.data),
  });

  const markFilledMutation = useMutation({
    mutationFn: (positionId: number) => api.put(`/positions/${positionId}`, { status: "filled" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["position-vacancies"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["position-dashboard"] });
      showToast("success", pending ? (tx("markSuccess", { title: pending.title }) as string) : (tx("markSuccessGeneric") as string));
      setPending(null);
    },
    onError: (error: any) => {
      showToast("error", error?.response?.data?.error?.message || (tx("markError") as string));
      setPending(null);
    },
  });

  const vacancies: any[] = data || [];
  const departments = useMemo(
    () => Array.from(new Set(vacancies.map((vacancy) => vacancy.department_name).filter(Boolean))).sort(),
    [vacancies],
  );

  const filteredVacancies = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return vacancies.filter((vacancy) => {
      const matchesSearch = !normalizedSearch || [vacancy.title, vacancy.code, vacancy.department_name]
        .some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
      const matchesDepartment = !department || vacancy.department_name === department;
      const matchesType = !employmentType || vacancy.employment_type === employmentType;
      const matchesStatus = !status || (status === "critical" ? Boolean(vacancy.is_critical) : vacancy.status === status);
      return matchesSearch && matchesDepartment && matchesType && matchesStatus;
    });
  }, [department, employmentType, search, status, vacancies]);

  const sortedVacancies = useMemo(() => {
    const sortValue = (position: any): string | number => {
      switch (sort.key) {
        case "title": return position.title || "";
        case "code": return position.code || "";
        case "department": return position.department_name || "";
        case "type": return position.employment_type || "";
        case "openings": return Number(position.open_count || 0);
        case "filled": return getFilledCount(position);
        case "status": return position.is_critical ? "critical" : position.status || "active";
      }
    };

    return [...filteredVacancies].sort((first, second) => {
      const firstValue = sortValue(first);
      const secondValue = sortValue(second);
      const comparison = typeof firstValue === "number" && typeof secondValue === "number"
        ? firstValue - secondValue
        : String(firstValue).localeCompare(String(secondValue), undefined, { sensitivity: "base" });
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [filteredVacancies, sort]);

  const changeSort = (key: VacancySortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const stats = useMemo(() => {
    const totalBudget = vacancies.reduce((sum, vacancy) => sum + Number(vacancy.headcount_budget || 0), 0);
    const inProgress = vacancies.filter((vacancy) => getFilledCount(vacancy) > 0).length;
    const criticalPositions = vacancies.filter((vacancy) => Boolean(vacancy.is_critical)).length;
    return {
      openPositions: vacancies.length,
      totalBudget,
      inProgress,
      criticalPositions,
    };
  }, [vacancies]);

  const typeLabel = (value?: string) => {
    const labels: Record<string, string> = {
      full_time: listTx("fullTime") as string,
      part_time: listTx("partTime") as string,
      contract: listTx("contract") as string,
      intern: listTx("intern") as string,
    };
    return labels[value || ""] || (value || "-").replace(/_/g, " ");
  };

  const statusLabel = (position: any) => {
    if (position.is_critical) return tx("critical", { defaultValue: "Critical" }) as string;
    const value = position.status || "active";
    return listTx(`status${value.charAt(0).toUpperCase()}${value.slice(1)}`, { defaultValue: value }) as string;
  };

  const statusClass = (position: any) => position.is_critical
    ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
    : position.status === "frozen"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";

  const fillPercentage = (position: any) => {
    const budget = Number(position.headcount_budget || 0);
    return budget > 0 ? Math.min(100, Math.round((getFilledCount(position) / budget) * 100)) : 0;
  };

  const salaryLabel = (position: any) => {
    if (!position.min_salary && !position.max_salary) return "";
    const currency = position.currency || "INR";
    const formatter = new Intl.NumberFormat("en-IN", {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    const min = position.min_salary ? formatter.format(Number(position.min_salary) / 100) : null;
    const max = position.max_salary ? formatter.format(Number(position.max_salary) / 100) : null;
    const range = min && max ? `${min} - ${max}` : min || max || "";
    return range ? `${currency} ${range}` : "";
  };

  const exportVacancies = () => {
    const headers = ["Title", "Code", "Department", "Type", "Openings", "Filled", "Budget", "Status"];
    const rows = filteredVacancies.map((position) => [
      position.title,
      position.code || "",
      position.department_name || "",
      typeLabel(position.employment_type),
      position.open_count || 0,
      getFilledCount(position),
      position.headcount_budget || 0,
      statusLabel(position),
    ]);
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "open-vacancies.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-foreground">{tx("title")}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {tx("subtitle")}
            {!isLoading && (
              <span role="status" className="ml-2 font-semibold text-brand-600 dark:text-brand-400">
                {tx("positionsWithOpenings", { count: stats.openPositions })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={exportVacancies} className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-[13px] font-semibold text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
            <Download aria-hidden="true" className="h-4 w-4" />
            {tx("export", { defaultValue: "Export" })}
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <Link to="/positions/list?create=1" className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2">
            <Plus aria-hidden="true" className="h-4 w-4" />
            {listTx("createPosition")}
          </Link>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: tx("openPositions", { defaultValue: "Open Positions" }), value: stats.openPositions, icon: UserRound, colors: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" },
          { label: tx("totalBudget", { defaultValue: "Total Headcount (Budget)" }), value: stats.totalBudget, icon: Users, colors: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300" },
          { label: tx("inProgress", { defaultValue: "Positions in Progress" }), value: stats.inProgress, icon: Clock3, colors: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300" },
          { label: tx("criticalPositions", { defaultValue: "Critical Positions" }), value: stats.criticalPositions, icon: AlertTriangle, colors: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300" },
        ].map(({ label, value, icon: Icon, colors }) => (
          <div key={String(label)} className="flex min-h-[76px] items-center gap-3.5 rounded-xl border border-border bg-card p-3.5 shadow-sm">
            <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colors}`}><Icon aria-hidden="true" className="h-5 w-5" /></span>
            <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-[22px] font-bold leading-none tabular-nums text-foreground">{value}</p></div>
          </div>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-[minmax(360px,1fr)_140px_120px_120px_auto]">
        <div className="relative sm:col-span-2 xl:col-span-1">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input aria-label={tx("searchPlaceholder", { defaultValue: "Search vacancies" }) as string} name="vacancy-search" autoComplete="off" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx("searchPlaceholder", { defaultValue: "Search by title, code, or department…" }) as string} className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-3.5 text-[13px] text-foreground shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
        </div>
        <div className="relative">
          <select aria-label={listTx("allDepartments") as string} value={department} onChange={(event) => setDepartment(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-border bg-card px-3.5 pr-9 text-[13px] text-foreground shadow-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
            <option value="">{listTx("allDepartments")}</option>
            {departments.map((name) => <option key={String(name)} value={String(name)}>{String(name)}</option>)}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative">
          <select aria-label={listTx("allTypes") as string} value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-border bg-card px-3.5 pr-9 text-[13px] text-foreground shadow-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
            <option value="">{listTx("allTypes")}</option><option value="full_time">{listTx("fullTime")}</option><option value="part_time">{listTx("partTime")}</option><option value="contract">{listTx("contract")}</option><option value="intern">{listTx("intern")}</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative">
          <select aria-label={listTx("allStatuses") as string} value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-border bg-card px-3.5 pr-9 text-[13px] text-foreground shadow-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
            <option value="">{listTx("allStatuses")}</option><option value="active">{listTx("statusActive")}</option><option value="frozen">{listTx("statusFrozen")}</option><option value="critical">{tx("critical", { defaultValue: "Critical" })}</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="inline-flex h-10 rounded-lg border border-border bg-card p-1 shadow-sm" role="group" aria-label={tx("viewMode", { defaultValue: "View mode" }) as string}>
          <button type="button" onClick={() => setViewMode("grid")} aria-pressed={viewMode === "grid"} className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${viewMode === "grid" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" : "text-muted-foreground hover:bg-muted"}`}><LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />{tx("grid", { defaultValue: "Grid" })}</button>
          <button type="button" onClick={() => setViewMode("list")} aria-pressed={viewMode === "list"} className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${viewMode === "list" ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" : "text-muted-foreground hover:bg-muted"}`}><List aria-hidden="true" className="h-3.5 w-3.5" />{tx("list", { defaultValue: "List" })}</button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card text-[13px] text-muted-foreground">{tx("loading")}</div>
      ) : filteredVacancies.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-8 py-10 text-center">
          <BriefcaseBusiness aria-hidden="true" className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <h3 className="text-base font-semibold text-foreground">{tx("noVacanciesTitle")}</h3>
          <p className="mt-1 text-[13px] text-muted-foreground">{tx("noVacanciesSubtitle")}</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {filteredVacancies.map((position) => (
            <article key={position.id} className="flex min-h-[200px] flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/positions/${position.id}`} className="block truncate text-[15px] font-bold leading-snug text-foreground hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">{position.title}</Link>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{position.code || "-"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(position)}`}>
                    {position.is_critical ? <AlertTriangle aria-hidden="true" className="h-3 w-3" /> : <CheckCircle2 aria-hidden="true" className="h-3 w-3" />}
                    {statusLabel(position)}
                  </span>
                  <button type="button" aria-label={tx("moreActions", { defaultValue: "More actions" }) as string} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"><MoreVertical aria-hidden="true" className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-4 text-xs text-muted-foreground">
                <p className="flex min-w-0 items-center gap-1.5"><Building2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-brand-500" /><span className="truncate">{position.department_name || tx("unassigned")}</span></p>
                <p className="flex shrink-0 items-center gap-1.5"><BriefcaseBusiness aria-hidden="true" className="h-3.5 w-3.5 text-brand-500" />{typeLabel(position.employment_type)}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><p className="text-xl font-bold leading-none tabular-nums text-orange-600">{position.open_count || 0}</p><p className="mt-1 text-[11px] text-muted-foreground">{tx("openings", { count: position.open_count || 0 })}</p></div>
                <div className="text-right"><p className="text-sm font-bold leading-none tabular-nums text-foreground">{getFilledCount(position)}/{position.headcount_budget || 0}</p><p className="mt-1 text-[11px] text-muted-foreground">{tx("filled", { defaultValue: "Filled" })}</p></div>
              </div>
              <div className="mt-1.5">
                <div role="progressbar" aria-label={`${position.title} ${tx("filled", { defaultValue: "Filled" })}`} aria-valuenow={fillPercentage(position)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-500" style={{ width: `${fillPercentage(position)}%` }} /></div>
                <p className="mt-1 text-right text-[10px] font-medium tabular-nums text-muted-foreground">{fillPercentage(position)}%</p>
              </div>
              <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-2">
                <button type="button" onClick={() => setPending({ id: position.id, title: position.title })} disabled={markFilledMutation.isPending} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:opacity-50"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />{markFilledMutation.isPending && markFilledMutation.variables === position.id ? tx("marking") : tx("mark")}</button>
                {salaryLabel(position) && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><Users aria-hidden="true" className="h-3 w-3" />{salaryLabel(position)}</span>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[1120px]">
            <caption className="sr-only">{tx("title")}</caption>
            <thead className="border-b border-border bg-muted/45">
              <tr>
                {[
                  { key: "title" as const, label: tx("positionTitle", { defaultValue: "Position Title" }) },
                  { key: "code" as const, label: listTx("colCode") },
                  { key: "department" as const, label: t("common.department") },
                  { key: "type" as const, label: listTx("colType") },
                  { key: "openings" as const, label: tx("openPositions", { defaultValue: "Openings" }) },
                  { key: "filled" as const, label: tx("filledTotal", { defaultValue: "Filled / Total" }) },
                  { key: "status" as const, label: t("common.status") },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    scope="col"
                    aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                    className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    <button type="button" onClick={() => changeSort(key)} className="inline-flex items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
                      {label}
                      {sort.key === key
                        ? <ArrowUp aria-hidden="true" className={`h-3.5 w-3.5 text-brand-600 transition-transform ${sort.direction === "desc" ? "rotate-180" : ""}`} />
                        : <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5 opacity-45" />}
                    </button>
                  </th>
                ))}
                <th scope="col" className="w-[190px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {tx("action", { defaultValue: "Action" })}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedVacancies.map((position) => (
                <tr key={position.id} className="h-16 transition-colors hover:bg-muted/35">
                  <td className="px-4 py-3.5"><Link to={`/positions/${position.id}`} className="inline-flex min-w-0 items-center gap-2.5 text-[13px] font-semibold text-foreground hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"><FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{position.title}</span></Link></td>
                  <td className="px-4 py-3.5 font-mono text-xs font-medium text-brand-600">{position.code || "-"}</td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Building2 aria-hidden="true" className="h-3.5 w-3.5" />{position.department_name || tx("unassigned")}</span></td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">{typeLabel(position.employment_type)}</td>
                  <td className="px-4 py-3.5"><p className="text-[13px] font-semibold leading-none tabular-nums text-orange-600">{position.open_count || 0}</p><p className="mt-1 text-[10px] text-muted-foreground">{tx("openings", { count: position.open_count || 0 })}</p></td>
                  <td className="px-4 py-3.5"><div className="min-w-[130px]"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold tabular-nums text-foreground">{getFilledCount(position)}/{position.headcount_budget || 0}</span><span className="text-[10px] tabular-nums text-muted-foreground">{fillPercentage(position)}%</span></div><div role="progressbar" aria-label={`${position.title} ${tx("filled", { defaultValue: "Filled" })}`} aria-valuenow={fillPercentage(position)} aria-valuemin={0} aria-valuemax={100} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-500" style={{ width: `${fillPercentage(position)}%` }} /></div></div></td>
                  <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(position)}`}>{position.is_critical ? <AlertTriangle aria-hidden="true" className="h-3 w-3" /> : <CheckCircle2 aria-hidden="true" className="h-3 w-3" />}{statusLabel(position)}</span></td>
                  <td className="px-4 py-3.5"><div className="flex items-center gap-2"><button type="button" onClick={() => setPending({ id: position.id, title: position.title })} disabled={markFilledMutation.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:opacity-50"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />{tx("mark")}</button><Link to={`/positions/${position.id}`} aria-label={tx("viewDetails", { defaultValue: `View ${position.title} details` }) as string} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"><MoreVertical aria-hidden="true" className="h-4 w-4" /></Link></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending ? (tx("confirmTitle", { title: pending.title }) as string) : ""}
        description={tx("confirmDescription") as string}
        confirmText={tx("mark") as string}
        variant="success"
        loading={markFilledMutation.isPending}
        onConfirm={() => pending && markFilledMutation.mutate(pending.id)}
        onCancel={() => !markFilledMutation.isPending && setPending(null)}
      />
    </div>
  );
}
