import { useState, useEffect, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { usePermissions } from "@/lib/use-permissions";
import { showToast } from "@/components/ui/Toast";
import {
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  UserCheck,
  ChevronRight,
  ChevronLeft,
  X,
  Mail,
  Send,
  Search,
} from "lucide-react";

function formatDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getDaysColor(days: number): string {
  if (days < 0) return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40";
  if (days <= 7) return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40";
  if (days <= 15) return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40";
  if (days <= 30) return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/40";
  return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40";
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function getStatusBadge(status: string, t: TFn): { bg: string; text: string; label: string } {
  switch (status) {
    case "on_probation":
      return { bg: "bg-blue-100 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", label: t("probation.status.onProbation") };
    case "confirmed":
      return { bg: "bg-green-100 dark:bg-green-950/40", text: "text-green-700 dark:text-green-300", label: t("probation.status.confirmed") };
    case "extended":
      return { bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", label: t("probation.status.extended") };
    case "terminated":
      return { bg: "bg-red-100 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", label: t("probation.status.terminated") };
    default:
      return { bg: "bg-muted", text: "text-muted-foreground", label: status };
  }
}

// Key of the customizable email template managed from this page.
const TEMPLATE_KEY = "probation_confirmation";

// Placeholders the admin can insert into the template. Mirrors the values the
// server fills in at send time (see probation.service.ts buildProbationEmailVars).
const PLACEHOLDERS: { token: string; labelKey: string }[] = [
  { token: "{{employee_name}}", labelKey: "probation.placeholder.employeeName" },
  { token: "{{first_name}}", labelKey: "probation.placeholder.firstName" },
  { token: "{{designation}}", labelKey: "probation.placeholder.designation" },
  { token: "{{confirmation_date}}", labelKey: "probation.placeholder.confirmationDate" },
  { token: "{{date_of_joining}}", labelKey: "probation.placeholder.joinDate" },
  { token: "{{probation_end_date}}", labelKey: "probation.placeholder.probationEnd" },
  { token: "{{manager_name}}", labelKey: "probation.placeholder.manager" },
  { token: "{{company_name}}", labelKey: "probation.placeholder.company" },
];

// Sample values used only for the template editor's live preview.
const SAMPLE_VARS: Record<string, string> = {
  employee_name: "Arjun Sharma",
  first_name: "Arjun",
  designation: "Software Engineer",
  confirmation_date: "22 Jun 2026",
  date_of_joining: "15 Jan 2025",
  probation_end_date: "22 Jun 2026",
  manager_name: "Ananya Gupta",
  company_name: "TechNova",
};

function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k.toLowerCase()];
    return v == null ? "" : v;
  });
}

// Escape + paragraph-ize a plain-text message for the live preview. Mirrors the
// server's branded renderer so the preview matches what actually gets sent.
function messagePreviewHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((p) => {
      const html = esc(p.trim()).replace(/\n/g, "<br/>");
      return html ? `<p style="margin:0 0 12px;line-height:1.6;">${html}</p>` : "";
    })
    .filter(Boolean)
    .join("");
}

export default function ProbationPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  // Manage actions (confirm / extend) require probation:manage. Users with
  // only probation:view should be able to read the page but not act on it.
  // Backend enforces the same on the routes — this just hides the buttons
  // so view-only users don't see a 403 when they click.
  const canManage = has("probation:manage");
  const [confirmModal, setConfirmModal] = useState<any>(null);
  const [extendModal, setExtendModal] = useState<any>(null);
  const [extendDate, setExtendDate] = useState("");
  const [extendReason, setExtendReason] = useState("");
  // #1394 — Dashboard card filter for the employee list
  const [cardFilter, setCardFilter] = useState<
    "all" | "on_probation" | "upcoming_30" | "confirmed_this_month" | "overdue"
  >("all");

  // List filters: search + department + location + pagination
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  // Confirmation-email state (in the confirm modal)
  const [sendEmailOn, setSendEmailOn] = useState(true);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(false);

  // Template editor state
  const [templateOpen, setTemplateOpen] = useState(false);
  const [tplSubject, setTplSubject] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [tplLoading, setTplLoading] = useState(false);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplIsDefault, setTplIsDefault] = useState(true);
  const tplBodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Dashboard stats (overall counts — not narrowed by the list filters)
  const { data: dashboard } = useQuery({
    queryKey: ["probation-dashboard"],
    queryFn: () => api.get("/employees/probation/dashboard").then((r) => r.data.data),
  });

  // Upcoming confirmations banner
  const { data: upcoming } = useQuery({
    queryKey: ["probation-upcoming"],
    queryFn: () => api.get("/employees/probation/upcoming?days=30").then((r) => r.data.data),
  });

  // Filter dropdown options
  const { data: departments } = useQuery({
    queryKey: ["org-departments"],
    queryFn: () => api.get("/organizations/me/departments").then((r) => r.data.data),
    staleTime: 60000,
  });
  const { data: locations } = useQuery({
    queryKey: ["org-locations"],
    queryFn: () => api.get("/organizations/me/locations").then((r) => r.data.data),
    staleTime: 60000,
  });

  const listParams = {
    page,
    per_page: PER_PAGE,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(departmentId ? { department_id: departmentId } : {}),
    ...(locationId ? { location_id: locationId } : {}),
  };
  const isConfirmedView = cardFilter === "confirmed_this_month";

  // Single list query — picks the endpoint by card and passes filters + page.
  // The dashboard card maps to a server-side `view` so pagination stays correct.
  const { data: listResp, isLoading } = useQuery({
    queryKey: ["probation-list", cardFilter, listParams],
    queryFn: () => {
      const endpoint = isConfirmedView
        ? "/employees/probation/confirmed-this-month"
        : "/employees/probation";
      const params =
        isConfirmedView || cardFilter === "all"
          ? listParams
          : { ...listParams, view: cardFilter };
      return api.get(endpoint, { params }).then((r) => r.data);
    },
  });

  const employees: any[] = listResp?.data || [];
  const meta = listResp?.meta;

  // When the confirm modal opens, pull the rendered confirmation email for that
  // employee so HR can review/tweak it before sending.
  useEffect(() => {
    if (!confirmModal) return;
    setSendEmailOn(true);
    setEmailSubject("");
    setEmailBody("");
    setLoadingEmail(true);
    api
      .get(`/employees/${confirmModal.id}/probation/confirmation-email`)
      .then((r) => {
        setEmailSubject(r.data.data.subject || "");
        setEmailBody(r.data.data.body || "");
      })
      .catch(() => showToast("error", t("probation.toast.loadEmailFailed")))
      .finally(() => setLoadingEmail(false));
  }, [confirmModal]);

  // Confirm mutation
  const confirmMut = useMutation({
    mutationFn: (payload: { id: number; send_email: boolean; subject?: string; body?: string }) =>
      api
        .put(`/employees/${payload.id}/probation/confirm`, {
          send_email: payload.send_email,
          subject: payload.send_email ? payload.subject : undefined,
          body: payload.send_email ? payload.body : undefined,
        })
        .then((r) => r.data.data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["probation-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["probation-list"] });
      queryClient.invalidateQueries({ queryKey: ["probation-upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["probation-confirmed-this-month"] });
      if (sendEmailOn && data?.email_sent) {
        showToast("success", t("probation.toast.confirmedEmailSent"));
      } else if (sendEmailOn) {
        showToast("success", t("probation.toast.confirmedEmailFailed"));
      } else {
        showToast("success", t("probation.toast.confirmed"));
      }
      setConfirmModal(null);
    },
    onError: () => showToast("error", t("probation.toast.confirmError")),
  });

  // Extend mutation
  const extendMut = useMutation({
    mutationFn: ({ id, new_end_date, reason }: { id: number; new_end_date: string; reason: string }) =>
      api.put(`/employees/${id}/probation/extend`, { new_end_date, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["probation-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["probation-list"] });
      queryClient.invalidateQueries({ queryKey: ["probation-upcoming"] });
      setExtendModal(null);
      setExtendDate("");
      setExtendReason("");
    },
  });

  // --- Template editor actions -------------------------------------------------
  function openTemplateEditor() {
    setTemplateOpen(true);
    setTplLoading(true);
    api
      .get(`/email-templates/${TEMPLATE_KEY}`)
      .then((r) => {
        setTplSubject(r.data.data.subject || "");
        setTplBody(r.data.data.body || "");
        setTplIsDefault(!!r.data.data.is_default);
      })
      .catch(() => showToast("error", t("probation.toast.loadTemplateFailed")))
      .finally(() => setTplLoading(false));
  }

  function saveTemplate() {
    setTplSaving(true);
    api
      .put(`/email-templates/${TEMPLATE_KEY}`, { subject: tplSubject, body: tplBody })
      .then((r) => {
        setTplIsDefault(!!r.data.data.is_default);
        showToast("success", t("probation.toast.templateSaved"));
        setTemplateOpen(false);
      })
      .catch(() => showToast("error", t("probation.toast.saveTemplateFailed")))
      .finally(() => setTplSaving(false));
  }

  function insertPlaceholder(token: string) {
    const el = tplBodyRef.current;
    if (!el) {
      setTplBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? tplBody.length;
    const end = el.selectionEnd ?? tplBody.length;
    setTplBody((b) => b.slice(0, start) + token + b.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const dashboardCards: Array<{
    label: string;
    value: number;
    icon: any;
    color: string;
    filter: typeof cardFilter;
  }> = [
    {
      label: t("probation.cardOnProbation"),
      value: dashboard?.on_probation ?? 0,
      icon: Clock,
      color: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
      filter: "on_probation",
    },
    {
      label: t("probation.cardUpcoming"),
      value: dashboard?.upcoming_30_days ?? 0,
      icon: CalendarClock,
      color: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
      filter: "upcoming_30",
    },
    {
      label: t("probation.cardConfirmedThisMonth"),
      value: dashboard?.confirmed_this_month ?? 0,
      icon: CheckCircle2,
      color: "bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400",
      filter: "confirmed_this_month",
    },
    {
      label: t("probation.cardOverdue"),
      value: dashboard?.overdue ?? 0,
      icon: AlertTriangle,
      color: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
      filter: "overdue",
    },
  ];

  // Switch the active dashboard-card view and reset to page 1.
  function selectCard(next: typeof cardFilter) {
    setCardFilter(next);
    setPage(1);
  }

  const hasActiveFilters = !!(debouncedSearch || departmentId || locationId);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-md bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
            <Shield className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("probation.title")}</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {t("probation.subtitle")}
            </p>
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openTemplateEditor}
            className="inline-flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-muted-foreground bg-card border border-border rounded-md hover:bg-muted transition-colors shrink-0"
          >
            <Mail className="h-4 w-4" />
            {t("probation.customizeEmail")}
          </button>
        )}
      </div>

      {/* Dashboard Cards — compact KPI tiles that also act as view filters. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        {dashboardCards.map((card) => {
          const isActive = cardFilter === card.filter;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => selectCard(isActive ? "all" : card.filter)}
              className={`text-left bg-card rounded-lg border p-3 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                isActive ? "border-brand-500 ring-1 ring-brand-500/30" : "border-border hover:border-brand-400"
              }`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-md ${card.color}`}>
                <card.icon className="h-4 w-4" />
              </span>
              <p className="mt-2.5 text-2xl font-semibold tabular-nums leading-none text-foreground">{card.value}</p>
              <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">{card.label}</p>
            </button>
          );
        })}
      </div>
      {cardFilter !== "all" && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t("probation.filteredByCard")}</span>
          <button
            type="button"
            onClick={() => selectCard("all")}
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            {t("probation.clearFilter")}
          </button>
        </div>
      )}

      {/* Upcoming Confirmations */}
      {upcoming && upcoming.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <h2 className="font-semibold text-amber-800 dark:text-amber-200">
              {t("probation.upcomingConfirmations", { count: upcoming.length })}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.slice(0, 5).map((emp: any) => (
              <div
                key={emp.id}
                className="inline-flex items-center gap-2 bg-card rounded-lg px-3 py-2 border border-amber-200"
              >
                <div className="h-7 w-7 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {emp.first_name?.[0]}{emp.last_name?.[0]}
                  </span>
                </div>
                <div>
                  <span className="text-sm font-medium text-foreground">
                    {emp.first_name} {emp.last_name}
                  </span>
                  <span className="text-xs text-amber-600 dark:text-amber-400 ml-2">
                    {t("probation.daysLeft", { count: emp.days_remaining })}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4 bg-card border border-border rounded-lg p-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("probation.searchPlaceholder")}
            className="bg-card text-foreground w-full pl-9 pr-4 py-2 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
          />
        </div>
        <select
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(e.target.value);
            setPage(1);
          }}
          className="bg-card text-foreground px-3 py-2 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
        >
          <option value="">{t("probation.allDepartments")}</option>
          {(departments || []).map((d: any) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={locationId}
          onChange={(e) => {
            setLocationId(e.target.value);
            setPage(1);
          }}
          className="bg-card text-foreground px-3 py-2 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
        >
          <option value="">{t("probation.allLocations")}</option>
          {(locations || []).map((l: any) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {/* Main Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {cardFilter === "confirmed_this_month"
              ? t("probation.cardConfirmedThisMonth")
              : t("probation.employeesOnProbation")}
          </h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-6 w-6 border-2 border-border border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("probation.colEmployee")}</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("probation.colDepartment")}</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("probation.colLocation")}</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("probation.colJoinDate")}</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("probation.colProbationEnds")}</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("probation.colDaysRemaining")}</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("probation.colStatus")}</th>
                  <th className="text-right py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("probation.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp: any) => {
                  const status = getStatusBadge(emp.probation_status, t);
                  const daysColor = getDaysColor(Number(emp.days_remaining));
                  return (
                    <tr key={emp.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                              {emp.first_name?.[0]}{emp.last_name?.[0]}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {emp.first_name} {emp.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">{emp.designation || emp.emp_code || emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {emp.department_name || "-"}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {emp.location_name || "-"}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground text-xs tabular-nums">
                        {formatDate(emp.date_of_joining)}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground text-xs tabular-nums">
                        {formatDate(emp.probation_end_date)}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${daysColor}`}>
                          {Number(emp.days_remaining) < 0
                            ? t("probation.daysOverdue", { count: Math.abs(emp.days_remaining) })
                            : t("probation.daysShort", { count: emp.days_remaining })}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {emp.probation_status === "confirmed" || !canManage ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setConfirmModal(emp)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 hover:bg-green-100 dark:hover:bg-green-950/40 rounded-lg transition-colors"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              {t("probation.confirm")}
                            </button>
                            <button
                              onClick={() => {
                                setExtendModal(emp);
                                setExtendDate("");
                                setExtendReason("");
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/40 rounded-lg transition-colors"
                            >
                              <CalendarClock className="h-3.5 w-3.5" />
                              {t("probation.extend")}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      {hasActiveFilters
                        ? t("probation.emptyFiltered")
                        : cardFilter === "confirmed_this_month"
                        ? t("probation.emptyConfirmed")
                        : cardFilter === "overdue"
                        ? t("probation.emptyOverdue")
                        : cardFilter === "upcoming_30"
                        ? t("probation.emptyUpcoming")
                        : t("probation.emptyDefault")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              {t("probation.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-50 hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" /> {t("probation.previous")}
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-50 hover:bg-muted"
              >
                {t("probation.next")} <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">{t("probation.confirmModalTitle")}</h3>
              <button onClick={() => setConfirmModal(null)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              <Trans i18nKey="probation.confirmModalBody" values={{ name: `${confirmModal.first_name} ${confirmModal.last_name}` }} components={{ strong: <strong /> }} />
            </p>

            {/* Send-email toggle */}
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-muted cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmailOn}
                onChange={(e) => setSendEmailOn(e.target.checked)}
                disabled={!confirmModal.email}
                className="mt-0.5 h-4 w-4 rounded border-border text-brand-600 dark:text-brand-400 focus:ring-brand-500"
              />
              <span className="text-sm">
                <span className="font-medium text-foreground">{t("probation.sendConfirmationEmail")}</span>
                <span className="block text-xs text-muted-foreground">
                  {confirmModal.email
                    ? t("probation.sendsTo", { email: confirmModal.email })
                    : t("probation.noEmailOnFile")}
                </span>
              </span>
            </label>

            {sendEmailOn && confirmModal.email && (
              <div className="mt-4 space-y-3">
                {loadingEmail ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-6">
                    <div className="h-4 w-4 border-2 border-border border-t-gray-500 rounded-full animate-spin" />
                    {t("probation.loadingEmail")}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1">{t("probation.subject")}</label>
                      <input
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-muted-foreground">{t("probation.message")}</label>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmModal(null);
                            openTemplateEditor();
                          }}
                          className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          {t("probation.editDefaultTemplate")}
                        </button>
                      </div>
                      <textarea
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        rows={9}
                        className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-y"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("probation.editMessageHint")}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted hover:bg-muted rounded-lg transition-colors"
              >
                {t("probation.cancel")}
              </button>
              <button
                onClick={() =>
                  confirmMut.mutate({
                    id: confirmModal.id,
                    send_email: sendEmailOn && !!confirmModal.email,
                    subject: emailSubject,
                    body: emailBody,
                  })
                }
                disabled={confirmMut.isPending || (sendEmailOn && !!confirmModal.email && loadingEmail)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {sendEmailOn && confirmModal.email ? (
                  <Send className="h-3.5 w-3.5" />
                ) : (
                  <UserCheck className="h-3.5 w-3.5" />
                )}
                {confirmMut.isPending
                  ? t("probation.working")
                  : sendEmailOn && confirmModal.email
                  ? t("probation.sendEmailConfirm")
                  : t("probation.confirmOnly")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Modal */}
      {extendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">{t("probation.extendModalTitle")}</h3>
              <button
                onClick={() => {
                  setExtendModal(null);
                  setExtendDate("");
                  setExtendReason("");
                }}
                className="text-muted-foreground hover:text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              <Trans i18nKey="probation.extendModalBody" values={{ name: `${extendModal.first_name} ${extendModal.last_name}` }} components={{ strong: <strong /> }} />
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  {t("probation.newEndDate")}
                </label>
                <input
                  type="date"
                  value={extendDate}
                  onChange={(e) => setExtendDate(e.target.value)}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  {t("probation.reason")}
                </label>
                <textarea
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  placeholder={t("probation.reasonPlaceholder")}
                  rows={3}
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setExtendModal(null);
                  setExtendDate("");
                  setExtendReason("");
                }}
                className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted hover:bg-muted rounded-lg transition-colors"
              >
                {t("probation.cancel")}
              </button>
              <button
                onClick={() =>
                  extendMut.mutate({
                    id: extendModal.id,
                    new_end_date: extendDate,
                    reason: extendReason,
                  })
                }
                disabled={!extendDate || !extendReason || extendMut.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {extendMut.isPending ? t("probation.extending") : t("probation.extend")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customize Email Template Modal */}
      {templateOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-foreground">{t("probation.templateModalTitle")}</h3>
              <button onClick={() => setTemplateOpen(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {t("probation.templateModalDesc")}
              {tplIsDefault && " " + t("probation.usingDefault")}
            </p>

            {tplLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="h-6 w-6 border-2 border-border border-t-gray-500 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("probation.subject")}</label>
                  <input
                    value={tplSubject}
                    onChange={(e) => setTplSubject(e.target.value)}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                    placeholder={t("probation.subjectPlaceholder")}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">{t("probation.message")}</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PLACEHOLDERS.map((p) => (
                      <button
                        key={p.token}
                        type="button"
                        onClick={() => insertPlaceholder(p.token)}
                        title={t("probation.insertToken", { token: p.token })}
                        className="px-2 py-1 text-xs font-medium text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40 hover:bg-brand-100 dark:hover:bg-brand-950/40 rounded-md border border-brand-100"
                      >
                        + {t(p.labelKey)}
                      </button>
                    ))}
                  </div>
                  <textarea
                    ref={tplBodyRef}
                    value={tplBody}
                    onChange={(e) => setTplBody(e.target.value)}
                    rows={11}
                    className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-y font-mono"
                    placeholder={t("probation.bodyPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("probation.placeholderHint")}
                  </p>
                </div>

                {/* Live preview */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t("probation.previewLabel")}</p>
                  <div className="rounded-lg border border-border bg-muted p-4">
                    <div className="bg-card rounded-md border border-border p-4">
                      <p className="text-sm font-semibold text-foreground mb-2 pb-2 border-b border-border">
                        {substituteVars(tplSubject, SAMPLE_VARS) || t("probation.noSubject")}
                      </p>
                      <div
                        className="text-sm text-muted-foreground"
                        dangerouslySetInnerHTML={{
                          __html:
                            messagePreviewHtml(substituteVars(tplBody, SAMPLE_VARS)) ||
                            "<p class='text-muted-foreground'>(empty message)</p>",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setTemplateOpen(false)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted hover:bg-muted rounded-lg transition-colors"
              >
                {t("probation.cancel")}
              </button>
              <button
                onClick={saveTemplate}
                disabled={tplSaving || tplLoading || !tplSubject.trim() || !tplBody.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {tplSaving ? t("probation.saving") : t("probation.saveTemplate")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
