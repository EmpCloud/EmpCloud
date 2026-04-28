import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X, Clock, Plus } from "lucide-react";

type RegRow = {
  id: number;
  date: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  rejection_reason?: string | null;
  original_check_in?: string | null;
  original_check_out?: string | null;
  requested_check_in?: string | null;
  requested_check_out?: string | null;
  first_name?: string;
  last_name?: string;
  emp_code?: string;
  email?: string;
};

export default function RegularizationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"pending" | "all" | "my">("pending");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: "", requested_check_in: "", requested_check_out: "", reason: "" });
  // #1559 — Inline validation error so users see why the form wasn't submitted
  // (e.g. check-out earlier than check-in) without a jarring native alert.
  const [formError, setFormError] = useState<string | null>(null);
  // #1629 — Detail modal for the row that was clicked. The reason cell is
  // truncated at 200px so admins couldn't read longer explanations; the
  // modal shows the full record (employee, times, reason, rejection note).
  const [selectedRow, setSelectedRow] = useState<RegRow | null>(null);

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ["regularizations", "pending", page],
    queryFn: () => api.get("/attendance/regularizations", { params: { page, status: "pending" } }).then((r) => r.data),
    enabled: tab === "pending",
  });

  const { data: allData, isLoading: allLoading } = useQuery({
    queryKey: ["regularizations", "all", page],
    queryFn: () => api.get("/attendance/regularizations", { params: { page } }).then((r) => r.data),
    enabled: tab === "all",
  });

  const { data: myData, isLoading: myLoading } = useQuery({
    queryKey: ["regularizations", "my", page],
    queryFn: () => api.get("/attendance/regularizations/me", { params: { page } }).then((r) => r.data),
    enabled: tab === "my",
  });

  const submitReg = useMutation({
    mutationFn: (data: typeof form) => api.post("/attendance/regularizations", {
      date: data.date,
      requested_check_in: data.requested_check_in || null,
      requested_check_out: data.requested_check_out || null,
      reason: data.reason,
    }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regularizations"] });
      setShowForm(false);
      setForm({ date: "", requested_check_in: "", requested_check_out: "", reason: "" });
    },
  });

  const processReg = useMutation({
    mutationFn: ({ id, status, rejection_reason }: { id: number; status: "approved" | "rejected"; rejection_reason?: string }) =>
      api.put(`/attendance/regularizations/${id}/approve`, { status, rejection_reason }).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regularizations"] }),
  });

  const handleApprove = (id: number) => processReg.mutate({ id, status: "approved" });
  const handleReject = (id: number) => {
    const reason = prompt(t('attendance.regularizations.rejectionPrompt'));
    processReg.mutate({ id, status: "rejected", rejection_reason: reason || undefined });
  };

  const currentData = tab === "pending" ? pendingData : tab === "all" ? allData : myData;
  const isLoading = tab === "pending" ? pendingLoading : tab === "all" ? allLoading : myLoading;
  const records = currentData?.data || [];
  const meta = currentData?.meta;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    // #1559 — Reject check-out earlier than or equal to check-in. The backend
    // may also validate this, but catching it client-side gives an immediate,
    // focused error message instead of a generic API failure.
    if (form.requested_check_in && form.requested_check_out) {
      if (new Date(form.requested_check_out).getTime() <= new Date(form.requested_check_in).getTime()) {
        setFormError(t('attendance.regularizations.checkoutAfterCheckin'));
        return;
      }
    }
    submitReg.mutate(form);
  };

  const setField = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const tabs = [
    { key: "pending" as const, labelKey: "attendance.regularizations.tabs.pending" },
    { key: "all" as const, labelKey: "attendance.regularizations.tabs.all" },
    { key: "my" as const, labelKey: "attendance.regularizations.tabs.my" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('attendance.regularizations.title')}</h1>
          <p className="text-gray-500 mt-1">{t('attendance.regularizations.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> {t('attendance.regularizations.newRequest')}
        </button>
      </div>

      {/* Submit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('attendance.regularizations.submitTitle')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('attendance.regularizations.date')} <span className="text-red-500">*</span></label>
              <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('attendance.regularizations.reason')} <span className="text-red-500">*</span></label>
              <input type="text" value={form.reason} onChange={(e) => setField("reason", e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder={t('attendance.regularizations.reasonPlaceholder')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('attendance.regularizations.requestedCheckIn')}</label>
              <input type="datetime-local" value={form.requested_check_in} onChange={(e) => setField("requested_check_in", e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('attendance.regularizations.requestedCheckOut')}</label>
              {/* #1559 — `min` ties the check-out picker to the current check-in value
                  so users can't even pick an earlier time from the popover; the
                  handleSubmit check below is the authoritative enforcement. */}
              <input
                type="datetime-local"
                value={form.requested_check_out}
                min={form.requested_check_in || undefined}
                onChange={(e) => setField("requested_check_out", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          {formError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={submitReg.isPending} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">{t('attendance.regularizations.submit')}</button>
            <button type="button" onClick={() => { setShowForm(false); setFormError(null); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">{t('common.cancel')}</button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => { setTab(tabItem.key); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === tabItem.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {tab !== "my" && <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('attendance.regularizations.table.employee')}</th>}
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('attendance.regularizations.table.date')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('attendance.regularizations.table.originalInOut')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('attendance.regularizations.table.requestedInOut')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('attendance.regularizations.table.reason')}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('attendance.regularizations.table.status')}</th>
              {tab === "pending" && <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{t('attendance.regularizations.table.actions')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">{t('common.loading')}</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">{t('attendance.regularizations.noRecords')}</td></tr>
            ) : (
              records.map((r: RegRow) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedRow(r)}
                  className="hover:bg-gray-50 cursor-pointer"
                  title={t('attendance.regularizations.viewDetails')}
                >
                  {tab !== "my" && (
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.first_name} {r.last_name}</p>
                        <p className="text-xs text-gray-400">{r.emp_code || r.email}</p>
                      </div>
                    </td>
                  )}
                  <td className="px-6 py-4 text-sm text-gray-900">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    <div>{r.original_check_in ? new Date(r.original_check_in).toLocaleTimeString() : "-"}</div>
                    <div>{r.original_check_out ? new Date(r.original_check_out).toLocaleTimeString() : "-"}</div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600">
                    <div>{r.requested_check_in ? new Date(r.requested_check_in).toLocaleTimeString() : "-"}</div>
                    <div>{r.requested_check_out ? new Date(r.requested_check_out).toLocaleTimeString() : "-"}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-[200px] truncate">{r.reason}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                      r.status === "pending" ? "bg-yellow-50 text-yellow-700"
                        : r.status === "approved" ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      {r.status === "pending" ? <Clock className="h-3 w-3" /> : r.status === "approved" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {r.status === "pending" ? t('attendance.regularizations.statusPending') : r.status === "approved" ? t('attendance.regularizations.statusApproved') : t('attendance.regularizations.statusRejected')}
                    </span>
                    {r.rejection_reason && <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate">{r.rejection_reason}</p>}
                  </td>
                  {tab === "pending" && (
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApprove(r.id)}
                          disabled={processReg.isPending}
                          className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" /> {t('attendance.regularizations.approve')}
                        </button>
                        <button
                          onClick={() => handleReject(r.id)}
                          disabled={processReg.isPending}
                          className="flex items-center gap-1 text-xs bg-red-50 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" /> {t('attendance.regularizations.reject')}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">{t('attendance.pagination', { page: meta.page, totalPages: meta.total_pages, total: meta.total })}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50">{t('attendance.previous')}</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= meta.total_pages} className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50">{t('attendance.next')}</button>
            </div>
          </div>
        )}
      </div>

      {/* #1629 — Detail modal: opens on row click so the full reason and any
          rejection note are readable in full instead of being truncated. */}
      {selectedRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedRow(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t('attendance.regularizations.detailTitle')}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{new Date(selectedRow.date).toLocaleDateString()}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label={t('common.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="divide-y divide-gray-100 text-sm">
              {tab !== "my" && (selectedRow.first_name || selectedRow.last_name) && (
                <div className="grid grid-cols-3 gap-4 px-6 py-3">
                  <dt className="text-gray-500">{t('attendance.regularizations.table.employee')}</dt>
                  <dd className="col-span-2 text-gray-900">
                    {selectedRow.first_name} {selectedRow.last_name}
                    {(selectedRow.emp_code || selectedRow.email) && (
                      <span className="text-xs text-gray-400 ml-2">({selectedRow.emp_code || selectedRow.email})</span>
                    )}
                  </dd>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 px-6 py-3">
                <dt className="text-gray-500">{t('attendance.regularizations.table.originalInOut')}</dt>
                <dd className="col-span-2 text-gray-900">
                  <div>{selectedRow.original_check_in ? new Date(selectedRow.original_check_in).toLocaleString() : "-"}</div>
                  <div className="text-gray-500">{selectedRow.original_check_out ? new Date(selectedRow.original_check_out).toLocaleString() : "-"}</div>
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-4 px-6 py-3">
                <dt className="text-gray-500">{t('attendance.regularizations.table.requestedInOut')}</dt>
                <dd className="col-span-2 text-gray-900">
                  <div>{selectedRow.requested_check_in ? new Date(selectedRow.requested_check_in).toLocaleString() : "-"}</div>
                  <div className="text-gray-500">{selectedRow.requested_check_out ? new Date(selectedRow.requested_check_out).toLocaleString() : "-"}</div>
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-4 px-6 py-3">
                <dt className="text-gray-500">{t('attendance.regularizations.table.reason')}</dt>
                <dd className="col-span-2 text-gray-900 whitespace-pre-wrap break-words">{selectedRow.reason || "-"}</dd>
              </div>
              <div className="grid grid-cols-3 gap-4 px-6 py-3">
                <dt className="text-gray-500">{t('attendance.regularizations.table.status')}</dt>
                <dd className="col-span-2">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                    selectedRow.status === "pending" ? "bg-yellow-50 text-yellow-700"
                      : selectedRow.status === "approved" ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}>
                    {selectedRow.status === "pending" ? <Clock className="h-3 w-3" /> : selectedRow.status === "approved" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {selectedRow.status === "pending" ? t('attendance.regularizations.statusPending') : selectedRow.status === "approved" ? t('attendance.regularizations.statusApproved') : t('attendance.regularizations.statusRejected')}
                  </span>
                </dd>
              </div>
              {selectedRow.rejection_reason && (
                <div className="grid grid-cols-3 gap-4 px-6 py-3">
                  <dt className="text-gray-500">{t('attendance.regularizations.rejectionReason')}</dt>
                  <dd className="col-span-2 text-red-700 whitespace-pre-wrap break-words">{selectedRow.rejection_reason}</dd>
                </div>
              )}
            </dl>
            <div className="flex justify-end gap-2 rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-3">
              {selectedRow.status === "pending" && tab === "pending" && (
                <>
                  <button
                    type="button"
                    onClick={() => { handleReject(selectedRow.id); setSelectedRow(null); }}
                    disabled={processReg.isPending}
                    className="flex items-center gap-1 text-sm bg-red-50 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> {t('attendance.regularizations.reject')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleApprove(selectedRow.id); setSelectedRow(null); }}
                    disabled={processReg.isPending}
                    className="flex items-center gap-1 text-sm bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> {t('attendance.regularizations.approve')}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
