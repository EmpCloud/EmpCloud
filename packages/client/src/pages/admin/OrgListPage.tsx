import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import { Building2, Search, ChevronLeft, ChevronRight } from "lucide-react";

export default function OrgListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orgs", page, search],
    queryFn: () =>
      api
        .get("/admin/organizations", { params: { page, per_page: 20, search: search || undefined } })
        .then((r) => r.data),
  });

  const orgs = data?.data || [];
  const meta = data?.meta || { page: 1, total_pages: 1, total: 0 };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">All Organizations</h1>
            <p className="text-gray-500 mt-1">
              {meta.total} organization{meta.total !== 1 ? "s" : ""} registered on the platform.
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search organizations..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">Loading...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Organization</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Email</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Users</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Subscriptions</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Created</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((org: any) => (
                    <tr key={org.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <Link
                          to={`/admin/organizations/${org.id}`}
                          className="font-medium text-brand-600 hover:text-brand-800 hover:underline"
                        >
                          {org.name}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{org.email}</td>
                      <td className="py-3 px-4 text-gray-600">{org.user_count}</td>
                      <td className="py-3 px-4 text-gray-600">{org.subscription_count}</td>
                      <td className="py-3 px-4 text-gray-600">
                        {new Date(org.created_at).toLocaleDateString()}
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
                    </tr>
                  ))}
                  {orgs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-400">
                        No organizations found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {meta.total_pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Page {meta.page} of {meta.total_pages} ({meta.total} total)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
                    disabled={page >= meta.total_pages}
                    className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
