import { useUsers, useInviteUser } from "@/api/hooks";
import { useState } from "react";
import { UserPlus, Search, Mail } from "lucide-react";

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useUsers({ page, search: search || undefined });
  const inviteUser = useInviteUser();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("employee");

  const users = data?.data || [];
  const meta = data?.meta;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    await inviteUser.mutateAsync({ email: inviteEmail, role: inviteRole as any });
    setInviteEmail("");
    setShowInvite(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 mt-1">Manage your organization's team members.</p>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          <UserPlus className="h-4 w-4" /> Invite User
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <form onSubmit={handleInvite} className="bg-white rounded-xl border border-gray-200 p-6 mb-6 flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="colleague@company.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="employee">Employee</option>
              <option value="hr_manager">HR Manager</option>
              <option value="hr_admin">HR Admin</option>
              <option value="org_admin">Org Admin</option>
            </select>
          </div>
          <button type="submit" disabled={inviteUser.isPending} className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            <Mail className="h-4 w-4" /> Send Invite
          </button>
        </form>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="Search by name, email, or employee code..."
        />
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Name</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Email</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Role</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No users found</td></tr>
            ) : (
              users.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">
                        {u.first_name[0]}{u.last_name[0]}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{u.first_name} {u.last_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full capitalize">
                      {u.role.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      u.status === 1 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    }`}>
                      {u.status === 1 ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Page {meta.page} of {meta.total_pages} ({meta.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
