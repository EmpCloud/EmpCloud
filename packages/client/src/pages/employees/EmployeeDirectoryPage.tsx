import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Users, ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/api/client";
import { useDepartments } from "@/api/hooks";

export default function EmployeeDirectoryPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");

  const { data: departments } = useDepartments();

  const { data, isLoading } = useQuery({
    queryKey: ["employee-directory", { page, search: search || undefined, department_id: departmentId || undefined }],
    queryFn: () =>
      api
        .get("/employees/directory", {
          params: {
            page,
            per_page: 20,
            ...(search ? { search } : {}),
            ...(departmentId ? { department_id: departmentId } : {}),
          },
        })
        .then((r) => r.data),
  });

  const employees = data?.data || [];
  const meta = data?.meta;
  const deptList = departments || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Directory</h1>
          <p className="text-gray-500 mt-1">Browse and search your organization's employees.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Users className="h-4 w-4" />
          {meta ? `${meta.total} employees` : ""}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            placeholder="Search by name, email, designation, or department..."
          />
        </div>
        <select
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        >
          <option value="">All Departments</option>
          {deptList.map((d: any) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto -mx-4 lg:mx-0">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Employee</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Email</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Department</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Designation</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Emp Code</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gray-200" />
                        <div className="h-4 w-28 bg-gray-200 rounded" />
                      </div>
                    </td>
                    <td className="px-6 py-4"><div className="h-4 w-36 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-24 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-16 bg-gray-200 rounded" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-14 bg-gray-200 rounded-full" /></td>
                  </tr>
                ))}
              </>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  No employees found
                </td>
              </tr>
            ) : (
              employees.map((emp: any) => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link
                      to={`/employees/${emp.id}`}
                      className="flex items-center gap-3 group"
                    >
                      <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700">
                        {emp.first_name?.[0]}
                        {emp.last_name?.[0]}
                      </div>
                      <span className="text-sm font-medium text-gray-900 group-hover:text-brand-600">
                        {emp.first_name} {emp.last_name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{emp.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {emp.department_name || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {emp.designation || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {emp.emp_code || "-"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        emp.status === 1
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {emp.status === 1 ? "Active" : "Inactive"}
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
                className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= meta.total_pages}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
