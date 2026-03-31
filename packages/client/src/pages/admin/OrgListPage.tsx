import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  Building2,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  PlusCircle,
  X,
} from "lucide-react";

function formatINR(paise: number): string {
  const value = paise / 100;
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

type SortField = "name" | "created_at" | "user_count" | "subscription_count" | "monthly_spend";

export default function OrgListPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    org_name: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    org_country: "IN",
    org_timezone: "Asia/Kolkata",
  });
  const [createError, setCreateError] = useState("");

  const createOrg = useMutation({
    mutationFn: (data: typeof createForm) =>
      api.post("/auth/register", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      setShowCreateModal(false);
      setCreateForm({
        org_name: "",
        email: "",
        first_name: "",
        last_name: "",
        password: "",
        org_country: "IN",
        org_timezone: "Asia/Kolkata",
      });
      setCreateError("");
    },
    onError: (err: any) => {
      setCreateError(
        err?.response?.data?.error?.message || "Failed to create organization. Please check all fields."
      );
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orgs", page, search, sortBy, sortOrder],
    queryFn: () =>
      api
        .get("/admin/organizations", {
          params: {
            page,
            per_page: 20,
            search: search || undefined,
            sort_by: sortBy,
            sort_order: sortOrder,
          },
        })
        .then((r) => r.data),
  });

  const orgs = data?.data || [];
  const meta = data?.meta || { page: 1, total_pages: 1, total: 0 };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field)
      return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-brand-600" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-brand-600" />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">All Organizations</h1>
              <p className="text-gray-500 mt-0.5 text-sm">
                {meta.total} organization{meta.total !== 1 ? "s" : ""} registered on the platform.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <PlusCircle className="h-4 w-4" /> Create Organization
          </button>
        </div>
      </div>

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 z-50">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Create New Organization</h2>
              <button
                onClick={() => { setShowCreateModal(false); setCreateError(""); }}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCreateError("");
                createOrg.mutate(createForm);
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name *</label>
                <input
                  type="text"
                  value={createForm.org_name}
                  onChange={(e) => setCreateForm({ ...createForm, org_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="Acme Corp"
                  required
                  minLength={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin First Name *</label>
                  <input
                    type="text"
                    value={createForm.first_name}
                    onChange={(e) => setCreateForm({ ...createForm, first_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="John"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Last Name *</label>
                  <input
                    type="text"
                    value={createForm.last_name}
                    onChange={(e) => setCreateForm({ ...createForm, last_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email *</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="admin@acme.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password *</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="Min 8 chars, uppercase, lowercase, digit, special"
                  required
                  minLength={8}
                />
                <p className="text-xs text-gray-400 mt-1">Must contain uppercase, lowercase, digit, and special character.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    value={createForm.org_country}
                    onChange={(e) => setCreateForm({ ...createForm, org_country: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="IN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <input
                    type="text"
                    value={createForm.org_timezone}
                    onChange={(e) => setCreateForm({ ...createForm, org_timezone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="Asia/Kolkata"
                  />
                </div>
              </div>
              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {createError}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setCreateError(""); }}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createOrg.isPending}
                  className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4" />
                  {createOrg.isPending ? "Creating..." : "Create Organization"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th
                      className="text-left py-3 px-4 font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center gap-1.5">
                        Organization
                        <SortIcon field="name" />
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Admin Email</th>
                    <th
                      className="text-left py-3 px-4 font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                      onClick={() => handleSort("user_count")}
                    >
                      <div className="flex items-center gap-1.5">
                        Employees
                        <SortIcon field="user_count" />
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                      onClick={() => handleSort("subscription_count")}
                    >
                      <div className="flex items-center gap-1.5">
                        Active Modules
                        <SortIcon field="subscription_count" />
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                      onClick={() => handleSort("monthly_spend")}
                    >
                      <div className="flex items-center gap-1.5">
                        Monthly Spend
                        <SortIcon field="monthly_spend" />
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                    <th
                      className="text-left py-3 px-4 font-medium text-gray-500 cursor-pointer hover:text-gray-700"
                      onClick={() => handleSort("created_at")}
                    >
                      <div className="flex items-center gap-1.5">
                        Joined
                        <SortIcon field="created_at" />
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((org: any) => (
                    <tr
                      key={org.id}
                      className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Link
                          to={`/admin/organizations/${org.id}`}
                          className="font-medium text-gray-900 hover:text-brand-600 transition-colors"
                        >
                          {org.name}
                        </Link>
                        {org.slug && (
                          <p className="text-xs text-gray-400 font-mono mt-0.5">{org.slug}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600">{org.email}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-gray-700 font-medium">
                          {org.user_count}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-gray-700 font-medium">
                          {org.subscription_count}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-gray-700 font-medium">
                          {formatINR(org.monthly_spend)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            org.status === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {org.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-xs">
                        {new Date(org.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <Link
                          to={`/admin/organizations/${org.id}`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-all"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {orgs.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400">
                        No organizations found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {meta.total_pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50/50">
                <p className="text-sm text-gray-500">
                  Page {meta.page} of {meta.total_pages} ({meta.total} total)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
                    disabled={page >= meta.total_pages}
                    className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
