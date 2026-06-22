import { useState, useEffect, useRef } from "react";
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
  X,
  Mail,
  Send,
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
  if (days < 0) return "text-red-600 bg-red-50";
  if (days <= 7) return "text-red-600 bg-red-50";
  if (days <= 15) return "text-orange-600 bg-orange-50";
  if (days <= 30) return "text-yellow-600 bg-yellow-50";
  return "text-green-600 bg-green-50";
}

function getStatusBadge(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case "on_probation":
      return { bg: "bg-blue-100", text: "text-blue-700", label: "On Probation" };
    case "confirmed":
      return { bg: "bg-green-100", text: "text-green-700", label: "Confirmed" };
    case "extended":
      return { bg: "bg-amber-100", text: "text-amber-700", label: "Extended" };
    case "terminated":
      return { bg: "bg-red-100", text: "text-red-700", label: "Terminated" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-700", label: status };
  }
}

// Key of the customizable email template managed from this page.
const TEMPLATE_KEY = "probation_confirmation";

// Placeholders the admin can insert into the template. Mirrors the values the
// server fills in at send time (see probation.service.ts buildProbationEmailVars).
const PLACEHOLDERS: { token: string; label: string }[] = [
  { token: "{{employee_name}}", label: "Employee name" },
  { token: "{{first_name}}", label: "First name" },
  { token: "{{designation}}", label: "Designation" },
  { token: "{{confirmation_date}}", label: "Confirmation date" },
  { token: "{{date_of_joining}}", label: "Join date" },
  { token: "{{probation_end_date}}", label: "Probation end" },
  { token: "{{manager_name}}", label: "Manager" },
  { token: "{{company_name}}", label: "Company" },
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

  // Dashboard stats
  const { data: dashboard } = useQuery({
    queryKey: ["probation-dashboard"],
    queryFn: () => api.get("/employees/probation/dashboard").then((r) => r.data.data),
  });

  // On probation list
  const { data: employees, isLoading } = useQuery({
    queryKey: ["probation-list"],
    queryFn: () => api.get("/employees/probation").then((r) => r.data.data),
  });

  // Upcoming confirmations
  const { data: upcoming } = useQuery({
    queryKey: ["probation-upcoming"],
    queryFn: () => api.get("/employees/probation/upcoming?days=30").then((r) => r.data.data),
  });

  // #1419 — Confirmed this month list (fetched only when that card is active,
  // because /employees/probation returns on_probation/extended rows only and
  // would never contain confirmed employees).
  const { data: confirmedThisMonth, isLoading: loadingConfirmed } = useQuery({
    queryKey: ["probation-confirmed-this-month"],
    queryFn: () =>
      api.get("/employees/probation/confirmed-this-month").then((r) => r.data.data),
    enabled: cardFilter === "confirmed_this_month",
  });

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
      .catch(() => showToast("error", "Could not load the confirmation email."))
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
        showToast("success", "Probation confirmed — confirmation email sent.");
      } else if (sendEmailOn) {
        showToast("success", "Probation confirmed. Email couldn't be sent (check mail settings).");
      } else {
        showToast("success", "Probation confirmed.");
      }
      setConfirmModal(null);
    },
    onError: () => showToast("error", "Could not confirm probation. Please try again."),
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
      .catch(() => showToast("error", "Could not load the template."))
      .finally(() => setTplLoading(false));
  }

  function saveTemplate() {
    setTplSaving(true);
    api
      .put(`/email-templates/${TEMPLATE_KEY}`, { subject: tplSubject, body: tplBody })
      .then((r) => {
        setTplIsDefault(!!r.data.data.is_default);
        showToast("success", "Email template saved.");
        setTemplateOpen(false);
      })
      .catch(() => showToast("error", "Could not save the template."))
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
      label: "On Probation",
      value: dashboard?.on_probation ?? 0,
      icon: Clock,
      color: "bg-blue-50 text-blue-600",
      filter: "on_probation",
    },
    {
      label: "Upcoming (30 days)",
      value: dashboard?.upcoming_30_days ?? 0,
      icon: CalendarClock,
      color: "bg-amber-50 text-amber-600",
      filter: "upcoming_30",
    },
    {
      label: "Confirmed This Month",
      value: dashboard?.confirmed_this_month ?? 0,
      icon: CheckCircle2,
      color: "bg-green-50 text-green-600",
      filter: "confirmed_this_month",
    },
    {
      label: "Overdue",
      value: dashboard?.overdue ?? 0,
      icon: AlertTriangle,
      color: "bg-red-50 text-red-600",
      filter: "overdue",
    },
  ];

  // #1394 / #1419 — Pick the source list for the active card and apply any
  // additional client-side filtering. The confirmed-this-month card reads from
  // a separate endpoint because the on-probation query excludes confirmed
  // employees by design.
  const sourceList: any[] =
    cardFilter === "confirmed_this_month"
      ? confirmedThisMonth || []
      : employees || [];

  const filteredEmployees = sourceList.filter((emp: any) => {
    if (cardFilter === "all") return true;
    const daysRemaining = Number(emp.days_remaining ?? 0);
    if (cardFilter === "on_probation") return emp.probation_status === "on_probation";
    if (cardFilter === "overdue") return daysRemaining < 0;
    if (cardFilter === "upcoming_30") return daysRemaining >= 0 && daysRemaining <= 30;
    // confirmed_this_month: server already filters, no extra predicate needed
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Probation Tracking</h1>
            <p className="text-gray-500 mt-0.5 text-sm">
              Monitor and manage employee probation periods.
            </p>
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openTemplateEditor}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shrink-0"
          >
            <Mail className="h-4 w-4" />
            Customize Email Template
          </button>
        )}
      </div>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {dashboardCards.map((card) => {
          const isActive = cardFilter === card.filter;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => setCardFilter(isActive ? "all" : card.filter)}
              className={`text-left bg-white rounded-xl border p-5 transition-all hover:shadow-md ${
                isActive ? "border-brand-500 ring-2 ring-brand-100" : "border-gray-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${card.color}`}>
                  <card.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-xl font-bold text-gray-900">{card.value}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {cardFilter !== "all" && (
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
          <span>Filtered by card.</span>
          <button
            type="button"
            onClick={() => setCardFilter("all")}
            className="text-brand-600 hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Upcoming Confirmations */}
      {upcoming && upcoming.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="font-semibold text-amber-900">
              Upcoming Confirmations ({upcoming.length})
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.slice(0, 5).map((emp: any) => (
              <div
                key={emp.id}
                className="inline-flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-amber-200"
              >
                <div className="h-7 w-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-amber-700">
                    {emp.first_name?.[0]}{emp.last_name?.[0]}
                  </span>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {emp.first_name} {emp.last_name}
                  </span>
                  <span className="text-xs text-amber-600 ml-2">
                    {emp.days_remaining}d left
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {cardFilter === "confirmed_this_month"
            ? "Confirmed This Month"
            : "Employees on Probation"}
        </h2>

        {(isLoading && cardFilter !== "confirmed_this_month") ||
        (cardFilter === "confirmed_this_month" && loadingConfirmed) ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Employee</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Department</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Join Date</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Probation Ends</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Days Remaining</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp: any) => {
                  const status = getStatusBadge(emp.probation_status);
                  const daysColor = getDaysColor(Number(emp.days_remaining));
                  return (
                    <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-brand-700">
                              {emp.first_name?.[0]}{emp.last_name?.[0]}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {emp.first_name} {emp.last_name}
                            </p>
                            <p className="text-xs text-gray-400">{emp.designation || emp.emp_code || emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {emp.department_name || "-"}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-xs">
                        {formatDate(emp.date_of_joining)}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-xs">
                        {formatDate(emp.probation_end_date)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${daysColor}`}>
                          {Number(emp.days_remaining) < 0
                            ? `${Math.abs(emp.days_remaining)}d overdue`
                            : `${emp.days_remaining}d`}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {emp.probation_status === "confirmed" || !canManage ? (
                          <span className="text-xs text-gray-400">-</span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setConfirmModal(emp)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              Confirm
                            </button>
                            <button
                              onClick={() => {
                                setExtendModal(emp);
                                setExtendDate("");
                                setExtendReason("");
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                            >
                              <CalendarClock className="h-3.5 w-3.5" />
                              Extend
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      {cardFilter === "confirmed_this_month"
                        ? "No employees confirmed this month."
                        : cardFilter === "overdue"
                        ? "No overdue probations."
                        : cardFilter === "upcoming_30"
                        ? "No upcoming confirmations in the next 30 days."
                        : "No employees currently on probation."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Probation</h3>
              <button onClick={() => setConfirmModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Confirm probation for{" "}
              <strong>{confirmModal.first_name} {confirmModal.last_name}</strong> and mark them as a
              confirmed employee.
            </p>

            {/* Send-email toggle */}
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmailOn}
                onChange={(e) => setSendEmailOn(e.target.checked)}
                disabled={!confirmModal.email}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm">
                <span className="font-medium text-gray-900">Send confirmation email</span>
                <span className="block text-xs text-gray-500">
                  {confirmModal.email
                    ? `Sends to ${confirmModal.email}`
                    : "This employee has no email address on file."}
                </span>
              </span>
            </label>

            {sendEmailOn && confirmModal.email && (
              <div className="mt-4 space-y-3">
                {loadingEmail ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-6">
                    <div className="h-4 w-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                    Loading email…
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                      <input
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-gray-700">Message</label>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmModal(null);
                            openTemplateEditor();
                          }}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          Edit default template
                        </button>
                      </div>
                      <textarea
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        rows={9}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-y"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        You can edit this message for this employee before sending.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
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
                  ? "Working…"
                  : sendEmailOn && confirmModal.email
                  ? "Send Email & Confirm"
                  : "Confirm Only"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Modal */}
      {extendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Extend Probation</h3>
              <button
                onClick={() => {
                  setExtendModal(null);
                  setExtendDate("");
                  setExtendReason("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Extend probation for{" "}
              <strong>{extendModal.first_name} {extendModal.last_name}</strong>.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New End Date
                </label>
                <input
                  type="date"
                  value={extendDate}
                  onChange={(e) => setExtendDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <textarea
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  placeholder="Why is the probation being extended?"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-none"
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
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
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
                {extendMut.isPending ? "Extending..." : "Extend"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customize Email Template Modal */}
      {templateOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-gray-900">Probation Confirmation Email</h3>
              <button onClick={() => setTemplateOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Customize the email sent when an employee's probation is confirmed.
              {tplIsDefault && " Currently using the built-in default."}
            </p>

            {tplLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    value={tplSubject}
                    onChange={(e) => setTplSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                    placeholder="e.g. Probation Confirmed — Welcome aboard, {{first_name}}!"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PLACEHOLDERS.map((p) => (
                      <button
                        key={p.token}
                        type="button"
                        onClick={() => insertPlaceholder(p.token)}
                        title={`Insert ${p.token}`}
                        className="px-2 py-1 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-md border border-brand-100"
                      >
                        + {p.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    ref={tplBodyRef}
                    value={tplBody}
                    onChange={(e) => setTplBody(e.target.value)}
                    rows={11}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-y font-mono"
                    placeholder="Dear {{employee_name}}, ..."
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Insert placeholders with the buttons above. Leave a blank line between paragraphs.
                  </p>
                </div>

                {/* Live preview */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Preview (sample data)</p>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="bg-white rounded-md border border-gray-200 p-4">
                      <p className="text-sm font-semibold text-gray-900 mb-2 pb-2 border-b border-gray-100">
                        {substituteVars(tplSubject, SAMPLE_VARS) || "(no subject)"}
                      </p>
                      <div
                        className="text-sm text-gray-700"
                        dangerouslySetInnerHTML={{
                          __html:
                            messagePreviewHtml(substituteVars(tplBody, SAMPLE_VARS)) ||
                            "<p class='text-gray-400'>(empty message)</p>",
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
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveTemplate}
                disabled={tplSaving || tplLoading || !tplSubject.trim() || !tplBody.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {tplSaving ? "Saving…" : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
