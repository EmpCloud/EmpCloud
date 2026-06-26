import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  Plus,
  TicketCheck,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  awaiting_response: "bg-purple-100 text-purple-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
  reopened: "bg-red-100 text-red-700",
};

const CATEGORIES = [
  "leave", "payroll", "benefits", "it", "facilities", "onboarding", "policy", "general",
];

const PRIORITIES = ["low", "medium", "high", "urgent"];

export default function MyTicketsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  // Form state
  const [formCategory, setFormCategory] = useState("general");
  const [formPriority, setFormPriority] = useState("medium");
  const [formSubject, setFormSubject] = useState("");
  const [formDescription, setFormDescription] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["my-tickets", page, statusFilter],
    queryFn: () =>
      api
        .get("/helpdesk/tickets/my", {
          params: {
            page,
            per_page: 20,
            ...(statusFilter && { status: statusFilter }),
          },
        })
        .then((r) => r.data),
  });

  const createTicket = useMutation({
    mutationFn: (data: object) =>
      api.post("/helpdesk/tickets", data).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
      setShowForm(false);
      setFormSubject("");
      setFormDescription("");
      setFormCategory("general");
      setFormPriority("medium");
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTicket.mutateAsync({
      category: formCategory,
      priority: formPriority,
      subject: formSubject,
      description: formDescription,
    });
  };

  const tickets = data?.data || [];
  const meta = data?.meta;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("helpdesk.myTicketsPage.title")}</h1>
          <p className="text-gray-500 mt-1">
            {t("helpdesk.myTicketsPage.subtitle")}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t("helpdesk.myTicketsPage.raiseTicket")}
        </button>
      </div>

      {/* Create Ticket Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("helpdesk.myTicketsPage.newTicket")}
            </h2>
            <button
              onClick={() => setShowForm(false)}
              className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("helpdesk.myTicketsPage.category")}
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`helpdesk.myTicketsPage.cat.${c}`, { defaultValue: c })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("helpdesk.myTicketsPage.priorityLabel")}
                </label>
                <select
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {t(`helpdesk.myTicketsPage.priority.${p}`, { defaultValue: p })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("helpdesk.myTicketsPage.subject")}
              </label>
              <input
                type="text"
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder={t("helpdesk.myTicketsPage.subjectPlaceholder")}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("helpdesk.myTicketsPage.description")}
              </label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[120px]"
                placeholder={t("helpdesk.myTicketsPage.descriptionPlaceholder")}
                required
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                {t("helpdesk.myTicketsPage.cancel")}
              </button>
              <button
                type="submit"
                disabled={createTicket.isPending || !formSubject.trim() || !formDescription.trim()}
                className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <TicketCheck className="h-4 w-4" />
                {createTicket.isPending ? t("helpdesk.myTicketsPage.submitting") : t("helpdesk.myTicketsPage.submit")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => { setStatusFilter(""); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !statusFilter ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          {t("helpdesk.myTicketsPage.tabAll")}
        </button>
        {["open", "in_progress", "resolved", "closed"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s
                ? "bg-brand-50 text-brand-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t(`helpdesk.myTicketsPage.status.${s}`)}
          </button>
        ))}
      </div>

      {/* Tickets List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-4 w-10 bg-gray-200 rounded" />
                      <div className="h-4 w-14 bg-gray-200 rounded-full" />
                      <div className="h-4 w-16 bg-gray-200 rounded" />
                    </div>
                    <div className="h-4 w-2/3 bg-gray-200 rounded mb-1" />
                    <div className="h-3 w-full bg-gray-200 rounded" />
                  </div>
                  <div className="h-3 w-20 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            <TicketCheck className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg font-medium text-gray-500 mb-1">{t("helpdesk.myTicketsPage.noTickets")}</p>
            <p className="text-sm">
              {t("helpdesk.myTicketsPage.noTicketsHint")}
            </p>
          </div>
        ) : (
          tickets.map((ticket: any) => (
            <Link
              key={ticket.id}
              to={`/helpdesk/tickets/${ticket.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 font-mono">#{ticket.id}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        PRIORITY_COLORS[ticket.priority] || ""
                      }`}
                    >
                      {t(`helpdesk.myTicketsPage.priority.${ticket.priority}`, { defaultValue: ticket.priority })}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        STATUS_COLORS[ticket.status] || ""
                      }`}
                    >
                      {t(`helpdesk.myTicketsPage.status.${ticket.status}`, { defaultValue: ticket.status.replace(/_/g, " ") })}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 truncate">
                    {ticket.subject}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                    {ticket.description}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </p>
                  {ticket.assigned_to_name && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t("helpdesk.myTicketsPage.assigned", { name: ticket.assigned_to_name })}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-500">
            {t("helpdesk.myTicketsPage.pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> {t("helpdesk.myTicketsPage.previous")}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.total_pages}
              className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
            >
              {t("helpdesk.myTicketsPage.next")} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
