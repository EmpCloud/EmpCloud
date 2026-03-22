import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  User,
  GraduationCap,
  Briefcase,
  Users,
  MapPin,
  ArrowLeft,
} from "lucide-react";
import { Link } from "react-router-dom";
import api from "@/api/client";

type Tab = "personal" | "education" | "experience" | "dependents" | "addresses";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "personal", label: "Personal", icon: User },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "experience", label: "Experience", icon: Briefcase },
  { key: "dependents", label: "Dependents", icon: Users },
  { key: "addresses", label: "Addresses", icon: MapPin },
];

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const [activeTab, setActiveTab] = useState<Tab>("personal");

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["employee-profile", userId],
    queryFn: () => api.get(`/employees/${userId}/profile`).then((r) => r.data.data),
    enabled: !!userId,
  });

  const { data: education } = useQuery({
    queryKey: ["employee-education", userId],
    queryFn: () => api.get(`/employees/${userId}/education`).then((r) => r.data.data),
    enabled: !!userId && activeTab === "education",
  });

  const { data: experience } = useQuery({
    queryKey: ["employee-experience", userId],
    queryFn: () => api.get(`/employees/${userId}/experience`).then((r) => r.data.data),
    enabled: !!userId && activeTab === "experience",
  });

  const { data: dependents } = useQuery({
    queryKey: ["employee-dependents", userId],
    queryFn: () => api.get(`/employees/${userId}/dependents`).then((r) => r.data.data),
    enabled: !!userId && activeTab === "dependents",
  });

  const { data: addresses } = useQuery({
    queryKey: ["employee-addresses", userId],
    queryFn: () => api.get(`/employees/${userId}/addresses`).then((r) => r.data.data),
    enabled: !!userId && activeTab === "addresses",
  });

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Loading profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Employee not found
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <Link
        to="/employees"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Directory
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-brand-100 flex items-center justify-center text-xl font-bold text-brand-700">
            {profile.first_name?.[0]}
            {profile.last_name?.[0]}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {profile.first_name} {profile.last_name}
            </h1>
            <p className="text-sm text-gray-500">{profile.designation || "No designation"}</p>
            <p className="text-sm text-gray-400">{profile.email}</p>
          </div>
          <div className="ml-auto text-right text-sm text-gray-500">
            {profile.emp_code && <p>Emp Code: {profile.emp_code}</p>}
            {profile.date_of_joining && (
              <p>Joined: {new Date(profile.date_of_joining).toLocaleDateString()}</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {activeTab === "personal" && <PersonalTab profile={profile} />}
        {activeTab === "education" && <EducationTab data={education} />}
        {activeTab === "experience" && <ExperienceTab data={experience} />}
        {activeTab === "dependents" && <DependentsTab data={dependents} />}
        {activeTab === "addresses" && <AddressesTab data={addresses} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Components
// ---------------------------------------------------------------------------

function FieldRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="grid grid-cols-3 py-3 border-b border-gray-100 last:border-0">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="col-span-2 text-sm text-gray-900">{value || "-"}</dd>
    </div>
  );
}

function PersonalTab({ profile }: { profile: any }) {
  return (
    <dl>
      <FieldRow label="Personal Email" value={profile.personal_email} />
      <FieldRow label="Contact Number" value={profile.contact_number} />
      <FieldRow label="Gender" value={profile.gender} />
      <FieldRow
        label="Date of Birth"
        value={profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString() : null}
      />
      <FieldRow label="Blood Group" value={profile.blood_group} />
      <FieldRow label="Marital Status" value={profile.marital_status} />
      <FieldRow label="Nationality" value={profile.nationality} />
      <FieldRow label="Aadhar Number" value={profile.aadhar_number} />
      <FieldRow label="PAN Number" value={profile.pan_number} />
      <FieldRow label="Passport Number" value={profile.passport_number} />
      <FieldRow
        label="Passport Expiry"
        value={profile.passport_expiry ? new Date(profile.passport_expiry).toLocaleDateString() : null}
      />
      <FieldRow label="Visa Status" value={profile.visa_status} />
      <FieldRow
        label="Visa Expiry"
        value={profile.visa_expiry ? new Date(profile.visa_expiry).toLocaleDateString() : null}
      />
      <FieldRow label="Emergency Contact" value={profile.emergency_contact_name} />
      <FieldRow label="Emergency Phone" value={profile.emergency_contact_phone} />
      <FieldRow label="Emergency Relation" value={profile.emergency_contact_relation} />
      <FieldRow
        label="Probation Start"
        value={profile.probation_start_date ? new Date(profile.probation_start_date).toLocaleDateString() : null}
      />
      <FieldRow
        label="Probation End"
        value={profile.probation_end_date ? new Date(profile.probation_end_date).toLocaleDateString() : null}
      />
      <FieldRow
        label="Confirmation Date"
        value={profile.confirmation_date ? new Date(profile.confirmation_date).toLocaleDateString() : null}
      />
      <FieldRow label="Notice Period (days)" value={profile.notice_period_days} />
    </dl>
  );
}

function EducationTab({ data }: { data?: any[] }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400">No education records added yet.</p>;
  }
  return (
    <div className="space-y-4">
      {data.map((edu: any) => (
        <div key={edu.id} className="border border-gray-100 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900">{edu.degree}</h3>
          <p className="text-sm text-gray-600">{edu.institution}</p>
          {edu.field_of_study && (
            <p className="text-sm text-gray-500">{edu.field_of_study}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {edu.start_year && edu.end_year
              ? `${edu.start_year} - ${edu.end_year}`
              : edu.start_year
              ? `From ${edu.start_year}`
              : ""}
            {edu.grade ? ` | Grade: ${edu.grade}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

function ExperienceTab({ data }: { data?: any[] }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400">No work experience records added yet.</p>;
  }
  return (
    <div className="space-y-4">
      {data.map((exp: any) => (
        <div key={exp.id} className="border border-gray-100 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">{exp.designation}</h3>
            {exp.is_current && (
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                Current
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">{exp.company_name}</p>
          <p className="text-xs text-gray-400 mt-1">
            {exp.start_date ? new Date(exp.start_date).toLocaleDateString() : ""} -{" "}
            {exp.is_current
              ? "Present"
              : exp.end_date
              ? new Date(exp.end_date).toLocaleDateString()
              : ""}
          </p>
          {exp.description && (
            <p className="text-sm text-gray-500 mt-2">{exp.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function DependentsTab({ data }: { data?: any[] }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400">No dependents added yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Name</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Relationship</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">DOB</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Gender</th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Nominee</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((dep: any) => (
            <tr key={dep.id}>
              <td className="px-4 py-3 text-sm text-gray-900">{dep.name}</td>
              <td className="px-4 py-3 text-sm text-gray-500">{dep.relationship}</td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {dep.date_of_birth ? new Date(dep.date_of_birth).toLocaleDateString() : "-"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500 capitalize">{dep.gender || "-"}</td>
              <td className="px-4 py-3 text-sm">
                {dep.is_nominee ? (
                  <span className="text-green-700 font-medium">
                    Yes {dep.nominee_percentage ? `(${dep.nominee_percentage}%)` : ""}
                  </span>
                ) : (
                  <span className="text-gray-400">No</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddressesTab({ data }: { data?: any[] }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400">No addresses added yet.</p>;
  }
  return (
    <div className="space-y-4">
      {data.map((addr: any) => (
        <div key={addr.id} className="border border-gray-100 rounded-lg p-4">
          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium uppercase mb-2 inline-block">
            {addr.type}
          </span>
          <p className="text-sm text-gray-900">{addr.line1}</p>
          {addr.line2 && <p className="text-sm text-gray-600">{addr.line2}</p>}
          <p className="text-sm text-gray-500">
            {addr.city}, {addr.state} {addr.zipcode}
          </p>
          <p className="text-sm text-gray-400">{addr.country}</p>
        </div>
      ))}
    </div>
  );
}
