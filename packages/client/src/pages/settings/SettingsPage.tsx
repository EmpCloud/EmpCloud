import { useOrg, useDepartments, useLocations } from "@/api/hooks";
import { Building2, MapPin, Briefcase } from "lucide-react";

export default function SettingsPage() {
  const { data: org, isLoading } = useOrg();
  const { data: departments } = useDepartments();
  const { data: locations } = useLocations();

  if (isLoading) return <div className="text-gray-500">Loading settings...</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Organization Settings</h1>
        <p className="text-gray-500 mt-1">Manage your company details, departments, and locations.</p>
      </div>

      {/* Organization info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="h-5 w-5 text-brand-600" />
          <h2 className="font-semibold text-gray-900">Company Information</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            ["Name", org?.name],
            ["Legal Name", org?.legal_name],
            ["Email", org?.email],
            ["Phone", org?.contact_number],
            ["Country", org?.country],
            ["State", org?.state],
            ["City", org?.city],
            ["Timezone", org?.timezone],
            ["Language", org?.language],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-medium text-gray-900">{value || "—"}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Departments */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Briefcase className="h-5 w-5 text-brand-600" />
            <h2 className="font-semibold text-gray-900">Departments ({departments?.length || 0})</h2>
          </div>
          <ul className="space-y-2">
            {departments?.map((d: any) => (
              <li key={d.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                {d.name}
              </li>
            ))}
          </ul>
        </div>

        {/* Locations */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="h-5 w-5 text-brand-600" />
            <h2 className="font-semibold text-gray-900">Locations ({locations?.length || 0})</h2>
          </div>
          <ul className="space-y-2">
            {locations?.map((l: any) => (
              <li key={l.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                <span>{l.name}</span>
                {l.timezone && <span className="text-xs text-gray-400">{l.timezone}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
