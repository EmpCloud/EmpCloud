import { useAuditLogs } from "@/api/hooks";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Filter, Calendar, RotateCcw, ChevronDown } from "lucide-react";
import { DateRangePicker } from "@/components/DateRangePicker";

// Searchable single-select for the Action Type filter — the action list is long
// (30+ values), so a plain <select> is hard to scan. Type to filter; click or
// Enter to choose. Kept local to the audit page since it's the only consumer.
function ActionTypeSelect({
  value,
  options,
  onChange,
  searchPlaceholder,
  noMatchLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  searchPlaceholder: string;
  noMatchLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reset + focus the search box on open.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);
  // Keep the keyboard-highlighted row in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) choose(opt.value);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">{noMatchLabel}</li>
            ) : (
              filtered.map((o, i) => {
                const isSelected = o.value === value;
                const isActive = i === activeIndex;
                return (
                  <li key={o.value}>
                    <button
                      ref={isActive ? activeRef : undefined}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => choose(o.value)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex w-full items-center px-3 py-1.5 text-left text-sm ${
                        isSelected ? "font-medium text-brand-700" : "text-gray-700"
                      } ${isActive ? "bg-gray-100" : ""}`}
                    >
                      {o.label}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// Enum values stay frozen (these are what the server sends); the human
// labels come from `audit.actions.<value>` per locale.
const AUDIT_ACTION_VALUES = [
  "", "login", "logout", "login_failed", "register", "password_change",
  "password_reset", "user_created", "user_updated", "user_deactivated",
  "user_invited", "org_updated", "subscription_created",
  "subscription_updated", "subscription_cancelled", "seat_assigned",
  "seat_revoked", "token_issued", "token_revoked", "oauth_authorize",
  "oauth_token", "profile_updated", "attendance_checkin",
  "attendance_checkout", "leave_applied", "leave_approved", "leave_rejected",
  "leave_cancelled", "document_uploaded", "document_verified",
  "announcement_created", "policy_created", "policy_acknowledged",
];

// Color-code action categories
function getActionStyle(action: string): string {
  if (action.startsWith("login") || action === "logout" || action === "register") return "bg-blue-50 text-blue-700";
  if (action.startsWith("user_") || action === "password_change" || action === "password_reset") return "bg-purple-50 text-purple-700";
  if (action.startsWith("leave_")) return "bg-amber-50 text-amber-700";
  if (action.startsWith("attendance_")) return "bg-green-50 text-green-700";
  if (action.startsWith("subscription_") || action.startsWith("seat_")) return "bg-indigo-50 text-indigo-700";
  if (action.startsWith("oauth_") || action.startsWith("token_")) return "bg-gray-100 text-gray-600";
  if (action.startsWith("document_") || action.startsWith("policy_") || action.startsWith("announcement_")) return "bg-teal-50 text-teal-700";
  return "bg-gray-100 text-gray-700";
}

export default function AuditPage() {
  const { t, i18n } = useTranslation();
  const tx = (k: string, opts?: Record<string, unknown>) =>
    t(`audit.${k}`, opts ?? {});
  const actionLabel = (value: string) =>
    value === ""
      ? (tx("allActions") as string)
      : (t(`audit.actions.${value}`, { defaultValue: value.replace(/_/g, " ") }) as string);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data, isLoading } = useAuditLogs({
    page,
    action: action || undefined,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  });

  const logs = data?.data || [];
  const meta = data?.meta;

  const hasFilters = action || startDate || endDate;

  const clearFilters = () => {
    setAction("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  // Use the active locale for date formatting so e.g. ES renders
  // "18 may 2026, 9:38" instead of the en-IN fallback.
  const formatDate = (d: string) =>
    new Date(d).toLocaleString(i18n.language || undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{tx("title")}</h1>
        <p className="text-gray-500 mt-1">{tx("subtitle")}</p>
      </div>

      {/* Filter Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">{tx("filters")}</span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <RotateCcw className="h-3 w-3" /> {tx("clearAll")}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Action Type Filter — searchable single-select */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{tx("actionType")}</label>
            <ActionTypeSelect
              value={action}
              options={AUDIT_ACTION_VALUES.map((value) => ({ value, label: actionLabel(value) }))}
              onChange={(v) => { setAction(v); setPage(1); }}
              searchPlaceholder={tx("searchActions") as string}
              noMatchLabel={tx("noActionMatches") as string}
            />
          </div>

          {/* Date range — single composite control matching the /attendance filter.
              Replaces the old separate From/To native date inputs; Apply drives
              start_date / end_date so the query contract is unchanged. */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {t("attendance.dateFrom")} &mdash; {t("attendance.dateTo")}</span>
            </label>
            <DateRangePicker
              from={startDate}
              to={endDate}
              onApply={(f, to2) => {
                setStartDate(f);
                setEndDate(to2);
                setPage(1);
              }}
              allowEmpty
            />
          </div>
        </div>
      </div>

      {/* Results Summary */}
      {hasFilters && meta && (
        <div className="text-sm text-gray-500 mb-3">
          {tx("showingResults", { count: logs.length, total: meta.total })}
          {action && <span className="ml-1">{tx("showingFor")} <span className="font-medium text-gray-700">{actionLabel(action)}</span></span>}
          {startDate && <span className="ml-1">{tx("showingFrom")} <span className="font-medium text-gray-700">{startDate}</span></span>}
          {endDate && <span className="ml-1">{tx("showingTo")} <span className="font-medium text-gray-700">{endDate}</span></span>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colTime")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colAction")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colUser")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colResource")}</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">{tx("colIp")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 w-32 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded-full" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                  </tr>
                ))}
              </>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">
                    {hasFilters ? tx("noMatchingFilters") : tx("noLogs")}
                  </p>
                  {hasFilters && (
                    <button onClick={clearFilters} className="text-brand-600 text-sm mt-1 hover:underline">
                      {tx("clearFilters")}
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                  <td className="px-6 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-mono font-medium ${getActionStyle(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-700">
                    {log.user_first_name
                      ? `${log.user_first_name} ${log.user_last_name || ""}`.trim()
                      : log.user_id
                        ? (tx("userHash", { id: log.user_id }) as string)
                        : (tx("system") as string)}
                    {log.user_email && (
                      <span className="block text-xs text-gray-400">{log.user_email}</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500">
                    {log.resource_type ? (
                      <span className="text-xs">
                        {log.resource_type}
                        {log.resource_id && <span className="text-gray-400 ml-1">#{log.resource_id}</span>}
                      </span>
                    ) : (
                      <span className="text-gray-300">--</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-400 font-mono">{log.ip_address || "--"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              {tx("pageOf", { page: meta.page, total_pages: meta.total_pages, total: meta.total })}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50">{t("common.previous")}</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= meta.total_pages} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50">{t("common.next")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
