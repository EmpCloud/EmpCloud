import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User,
  GraduationCap,
  Briefcase,
  Users,
  MapPin,
  ArrowLeft,
  SlidersHorizontal,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";

const HR_ROLES = ["hr_admin", "hr_manager", "org_admin"];

type Tab = "personal" | "education" | "experience" | "dependents" | "addresses" | "custom";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "personal", label: "Personal", icon: User },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "experience", label: "Experience", icon: Briefcase },
  { key: "dependents", label: "Dependents", icon: Users },
  { key: "addresses", label: "Addresses", icon: MapPin },
  { key: "custom", label: "Custom Fields", icon: SlidersHorizontal },
];

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("personal");
  const [editing, setEditing] = useState(false);
  const currentUser = useAuthStore((s) => s.user);

  const isOwnProfile = currentUser?.id === userId;
  const isHR = currentUser ? HR_ROLES.includes(currentUser.role) : false;
  const canEdit = isOwnProfile || isHR;

  const isValidId = !!id && !isNaN(userId);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["employee-profile", userId],
    queryFn: () => api.get(`/employees/${userId}/profile`).then((r) => r.data.data),
    enabled: isValidId,
  });

  const { data: education } = useQuery({
    queryKey: ["employee-education", userId],
    queryFn: () => api.get(`/employees/${userId}/education`).then((r) => r.data.data),
    enabled: isValidId && activeTab === "education",
  });

  const { data: experience } = useQuery({
    queryKey: ["employee-experience", userId],
    queryFn: () => api.get(`/employees/${userId}/experience`).then((r) => r.data.data),
    enabled: isValidId && activeTab === "experience",
  });

  const { data: dependents } = useQuery({
    queryKey: ["employee-dependents", userId],
    queryFn: () => api.get(`/employees/${userId}/dependents`).then((r) => r.data.data),
    enabled: isValidId && activeTab === "dependents",
  });

  const { data: addresses } = useQuery({
    queryKey: ["employee-addresses", userId],
    queryFn: () => api.get(`/employees/${userId}/addresses`).then((r) => r.data.data),
    enabled: isValidId && activeTab === "addresses",
  });

  // Fetch users for reporting manager dropdown
  const { data: allUsers } = useQuery({
    queryKey: ["users-for-manager"],
    queryFn: () => api.get("/users", { params: { per_page: 500 } }).then((r) => r.data.data),
    enabled: editing,
  });

  const updateProfile = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.put(`/employees/${userId}/profile`, data).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-profile", userId] });
      setEditing(false);
    },
  });

  // Guard against missing or invalid id parameter (placed after all hooks to satisfy Rules of Hooks)
  if (!isValidId) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <User className="h-12 w-12 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-1">Invalid Employee</h2>
        <p className="text-sm text-gray-500 mb-4">The employee ID in the URL is missing or invalid.</p>
        <Link to="/employees" className="text-brand-600 text-sm font-medium hover:text-brand-700">
          &larr; Back to Employee Directory
        </Link>
      </div>
    );
  }

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
          <div className="ml-auto flex items-start gap-4">
            <div className="text-right text-sm text-gray-500">
              {profile.emp_code && <p>Emp Code: {profile.emp_code}</p>}
              {profile.date_of_joining && (
                <p>Joined: {new Date(profile.date_of_joining).toLocaleDateString()}</p>
              )}
            </div>
            {activeTab === "personal" && canEdit && (
              <button
                onClick={() => setEditing(!editing)}
                className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                {editing ? "Cancel" : isOwnProfile && !isHR ? "Edit My Info" : "Edit Profile"}
              </button>
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
        {activeTab === "personal" && (
          <PersonalTab
            profile={profile}
            editing={editing}
            onSave={(data: Record<string, unknown>) => updateProfile.mutate(data)}
            saving={updateProfile.isPending}
            error={updateProfile.isError ? ((updateProfile.error as any)?.response?.data?.error?.message || "Failed to save") : null}
            allUsers={allUsers || []}
            userId={userId}
            selfService={isOwnProfile && !isHR}
          />
        )}
        {activeTab === "education" && <EducationTab data={education} />}
        {activeTab === "experience" && <ExperienceTab data={experience} />}
        {activeTab === "dependents" && <DependentsTab data={dependents} />}
        {activeTab === "addresses" && <AddressesTab data={addresses} />}
        {activeTab === "custom" && <CustomFieldsTab entityId={userId} />}
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

function PersonalTab({ profile, editing, onSave, saving, error, allUsers, userId, selfService }: { profile: any; editing?: boolean; onSave?: (data: Record<string, unknown>) => void; saving?: boolean; error?: string | null; allUsers?: any[]; userId?: number; selfService?: boolean }) {
  const [form, setForm] = useState<Record<string, string>>({});

  // Populate form when entering edit mode (via useEffect to avoid setState during render)
  useEffect(() => {
    if (editing && profile) {
      setForm({
        personal_email: profile.personal_email || "",
        contact_number: profile.contact_number || "",
        gender: profile.gender || "",
        date_of_birth: profile.date_of_birth ? profile.date_of_birth.slice(0, 10) : "",
        blood_group: profile.blood_group || "",
        marital_status: profile.marital_status || "",
        nationality: profile.nationality || "",
        aadhar_number: profile.aadhar_number || "",
        pan_number: profile.pan_number || "",
        passport_number: profile.passport_number || "",
        passport_expiry: profile.passport_expiry ? profile.passport_expiry.slice(0, 10) : "",
        visa_status: profile.visa_status || "",
        visa_expiry: profile.visa_expiry ? profile.visa_expiry.slice(0, 10) : "",
        emergency_contact_name: profile.emergency_contact_name || "",
        emergency_contact_phone: profile.emergency_contact_phone || "",
        emergency_contact_relation: profile.emergency_contact_relation || "",
        notice_period_days: profile.notice_period_days ? String(profile.notice_period_days) : "",
        reporting_manager_id: profile.reporting_manager_id ? String(profile.reporting_manager_id) : "",
      });
    } else if (!editing) {
      setForm({});
    }
  }, [editing, profile]);

  if (editing) {
    const set = (key: string, val: string) => setForm((prev) => ({ ...prev, [key]: val }));
    const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
    const disabledClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed";

    // Self-service employees can only edit personal/contact fields, not admin fields
    const SELF_SERVICE_FIELDS = [
      "personal_email", "contact_number", "gender", "date_of_birth",
      "blood_group", "marital_status", "nationality",
      "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
    ];
    const canEditField = (field: string) => !selfService || SELF_SERVICE_FIELDS.includes(field);

    return (
      <div>
        {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">{error}</div>}
        {selfService && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm p-3 rounded-lg mb-4">
            You can edit your personal and emergency contact information. Contact HR to update administrative fields.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Personal Email</label>
            <input type="email" value={form.personal_email} onChange={(e) => set("personal_email", e.target.value)} className={canEditField("personal_email") ? inputClass : disabledClass} disabled={!canEditField("personal_email")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
            <input type="text" value={form.contact_number} onChange={(e) => set("contact_number", e.target.value)} className={canEditField("contact_number") ? inputClass : disabledClass} disabled={!canEditField("contact_number")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
            <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className={canEditField("gender") ? inputClass : disabledClass} disabled={!canEditField("gender")}>
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
            <input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className={canEditField("date_of_birth") ? inputClass : disabledClass} disabled={!canEditField("date_of_birth")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
            <input type="text" value={form.blood_group} onChange={(e) => set("blood_group", e.target.value)} className={canEditField("blood_group") ? inputClass : disabledClass} disabled={!canEditField("blood_group")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Marital Status</label>
            <select value={form.marital_status} onChange={(e) => set("marital_status", e.target.value)} className={canEditField("marital_status") ? inputClass : disabledClass} disabled={!canEditField("marital_status")}>
              <option value="">Select</option>
              <option value="single">Single</option>
              <option value="married">Married</option>
              <option value="divorced">Divorced</option>
              <option value="widowed">Widowed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nationality</label>
            <input type="text" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} className={canEditField("nationality") ? inputClass : disabledClass} disabled={!canEditField("nationality")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Aadhar Number</label>
            <input type="text" value={form.aadhar_number} onChange={(e) => set("aadhar_number", e.target.value)} className={canEditField("aadhar_number") ? inputClass : disabledClass} disabled={!canEditField("aadhar_number")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number</label>
            <input type="text" value={form.pan_number} onChange={(e) => set("pan_number", e.target.value)} className={canEditField("pan_number") ? inputClass : disabledClass} disabled={!canEditField("pan_number")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passport Number</label>
            <input type="text" value={form.passport_number} onChange={(e) => set("passport_number", e.target.value)} className={canEditField("passport_number") ? inputClass : disabledClass} disabled={!canEditField("passport_number")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passport Expiry</label>
            <input type="date" value={form.passport_expiry} onChange={(e) => set("passport_expiry", e.target.value)} className={canEditField("passport_expiry") ? inputClass : disabledClass} disabled={!canEditField("passport_expiry")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Visa Status</label>
            <input type="text" value={form.visa_status} onChange={(e) => set("visa_status", e.target.value)} className={canEditField("visa_status") ? inputClass : disabledClass} disabled={!canEditField("visa_status")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Visa Expiry</label>
            <input type="date" value={form.visa_expiry} onChange={(e) => set("visa_expiry", e.target.value)} className={canEditField("visa_expiry") ? inputClass : disabledClass} disabled={!canEditField("visa_expiry")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
            <input type="text" value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} className={canEditField("emergency_contact_name") ? inputClass : disabledClass} disabled={!canEditField("emergency_contact_name")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Phone</label>
            <input type="text" value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} className={canEditField("emergency_contact_phone") ? inputClass : disabledClass} disabled={!canEditField("emergency_contact_phone")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Relation</label>
            <input type="text" value={form.emergency_contact_relation} onChange={(e) => set("emergency_contact_relation", e.target.value)} className={canEditField("emergency_contact_relation") ? inputClass : disabledClass} disabled={!canEditField("emergency_contact_relation")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notice Period (days)</label>
            <input type="number" value={form.notice_period_days} onChange={(e) => set("notice_period_days", e.target.value)} className={canEditField("notice_period_days") ? inputClass : disabledClass} disabled={!canEditField("notice_period_days")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reporting Manager</label>
            <select value={form.reporting_manager_id} onChange={(e) => set("reporting_manager_id", e.target.value)} className={canEditField("reporting_manager_id") ? inputClass : disabledClass} disabled={!canEditField("reporting_manager_id")}>
              <option value="">No Manager</option>
              {(allUsers || []).filter((u: any) => u.id !== userId).map((u: any) => (
                <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => onSave?.(Object.fromEntries(Object.entries(form).filter(([k]) => canEditField(k)).map(([k, v]) => [k, v || null])))}
            disabled={saving}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    );
  }

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
      <FieldRow label="Reporting Manager" value={profile.reporting_manager_name || (profile.reporting_manager_id ? `User #${profile.reporting_manager_id}` : null)} />
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

// ---------------------------------------------------------------------------
// Custom Fields Tab — Dynamic fields from custom field definitions
// ---------------------------------------------------------------------------

type CustomFieldValue = {
  field_id: number;
  field_name: string;
  field_key: string;
  field_type: string;
  section: string;
  is_required: boolean;
  help_text: string | null;
  options: string[] | null;
  value: unknown;
};

type FieldDef = {
  id: number;
  field_name: string;
  field_key: string;
  field_type: string;
  section: string;
  is_required: boolean;
  help_text: string | null;
  options: string[] | null;
  placeholder: string | null;
  default_value: string | null;
};

function CustomFieldsTab({ entityId }: { entityId: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [formValues, setFormValues] = useState<Record<number, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  // Fetch field definitions for employee type
  const { data: definitions = [] } = useQuery<FieldDef[]>({
    queryKey: ["custom-field-definitions", "employee"],
    queryFn: () =>
      api
        .get("/custom-fields/definitions", { params: { entity_type: "employee" } })
        .then((r) => r.data.data),
  });

  // Fetch current values for this employee
  const { data: values = [], isLoading } = useQuery<CustomFieldValue[]>({
    queryKey: ["custom-field-values", "employee", entityId],
    queryFn: () =>
      api
        .get(`/custom-fields/values/employee/${entityId}`)
        .then((r) => r.data.data),
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (payload: { values: Array<{ fieldId: number; value: unknown }> }) =>
      api.post(`/custom-fields/values/employee/${entityId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["custom-field-values", "employee", entityId],
      });
      setEditing(false);
      setError(null);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || "Failed to save custom fields");
    },
  });

  function startEditing() {
    // Pre-populate form values from existing values + definitions
    const initial: Record<number, unknown> = {};
    for (const def of definitions) {
      const existing = values.find((v) => v.field_id === def.id);
      initial[def.id] = existing?.value ?? def.default_value ?? (def.field_type === "checkbox" ? false : "");
    }
    setFormValues(initial);
    setEditing(true);
    setError(null);
  }

  function handleSave() {
    const payload = definitions.map((def) => ({
      fieldId: def.id,
      value: formValues[def.id] ?? null,
    }));
    saveMutation.mutate({ values: payload });
  }

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading custom fields...</p>;
  }

  if (definitions.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-gray-400">
          No custom fields have been defined for employees yet.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          HR administrators can create custom fields from the Custom Fields settings page.
        </p>
      </div>
    );
  }

  // Group definitions by section
  const sections: Record<string, FieldDef[]> = {};
  for (const def of definitions) {
    const sec = def.section || "Custom Fields";
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(def);
  }

  // Build a lookup for existing values
  const valueLookup: Record<number, unknown> = {};
  for (const v of values) {
    valueLookup[v.field_id] = v.value;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Custom Fields</h3>
        {!editing ? (
          <button
            onClick={startEditing}
            className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {Object.entries(sections).map(([sectionName, sectionDefs]) => (
        <div key={sectionName} className="mb-6 last:mb-0">
          {Object.keys(sections).length > 1 && (
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {sectionName}
            </h4>
          )}
          <dl>
            {sectionDefs.map((def) =>
              editing ? (
                <CustomFieldEdit
                  key={def.id}
                  def={def}
                  value={formValues[def.id]}
                  onChange={(val) =>
                    setFormValues((prev) => ({ ...prev, [def.id]: val }))
                  }
                />
              ) : (
                <CustomFieldDisplay
                  key={def.id}
                  def={def}
                  value={valueLookup[def.id]}
                />
              )
            )}
          </dl>
        </div>
      ))}
    </div>
  );
}

function CustomFieldDisplay({ def, value }: { def: FieldDef; value: unknown }) {
  let displayValue: string = "-";

  if (value !== null && value !== undefined && value !== "") {
    if (def.field_type === "checkbox") {
      displayValue = value ? "Yes" : "No";
    } else if (def.field_type === "multi_select" && Array.isArray(value)) {
      displayValue = value.join(", ");
    } else if (def.field_type === "date" || def.field_type === "datetime") {
      try {
        displayValue = new Date(value as string).toLocaleDateString();
      } catch {
        displayValue = String(value);
      }
    } else {
      displayValue = String(value);
    }
  }

  return (
    <div className="grid grid-cols-3 py-3 border-b border-gray-100 last:border-0">
      <dt className="text-sm font-medium text-gray-500">
        {def.field_name}
        {def.is_required && <span className="text-red-400 ml-0.5">*</span>}
      </dt>
      <dd className="col-span-2 text-sm text-gray-900">{displayValue}</dd>
    </div>
  );
}

function CustomFieldEdit({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const inputClass =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

  let input: React.ReactNode;

  switch (def.field_type) {
    case "text":
    case "email":
    case "phone":
    case "url":
      input = (
        <input
          type={def.field_type === "email" ? "email" : def.field_type === "phone" ? "tel" : def.field_type === "url" ? "url" : "text"}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder || ""}
          className={inputClass}
        />
      );
      break;
    case "textarea":
      input = (
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder || ""}
          rows={3}
          className={inputClass}
        />
      );
      break;
    case "number":
    case "decimal":
      input = (
        <input
          type="number"
          step={def.field_type === "decimal" ? "0.01" : "1"}
          value={value !== null && value !== undefined && value !== "" ? String(value) : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder={def.placeholder || ""}
          className={inputClass}
        />
      );
      break;
    case "date":
      input = (
        <input
          type="date"
          value={value ? String(value).slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={inputClass}
        />
      );
      break;
    case "datetime":
      input = (
        <input
          type="datetime-local"
          value={value ? String(value).slice(0, 16) : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={inputClass}
        />
      );
      break;
    case "dropdown":
      input = (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value || null)}
          className={inputClass}
        >
          <option value="">Select...</option>
          {(def.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
      break;
    case "multi_select": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      input = (
        <div className="space-y-1">
          {(def.options || []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...selected, opt]);
                  } else {
                    onChange(selected.filter((s) => s !== opt));
                  }
                }}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              {opt}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "checkbox":
      input = (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          {def.field_name}
        </label>
      );
      break;
    case "file":
      input = (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder || "File reference or path"}
          className={inputClass}
        />
      );
      break;
    default:
      input = (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );
  }

  return (
    <div className="grid grid-cols-3 py-3 border-b border-gray-100 last:border-0 items-start">
      <dt className="text-sm font-medium text-gray-500 pt-2">
        {def.field_name}
        {def.is_required && <span className="text-red-400 ml-0.5">*</span>}
        {def.help_text && (
          <p className="text-xs text-gray-400 font-normal mt-0.5">{def.help_text}</p>
        )}
      </dt>
      <dd className="col-span-2">{input}</dd>
    </div>
  );
}
