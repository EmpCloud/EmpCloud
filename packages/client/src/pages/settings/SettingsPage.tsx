import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg, useDepartments, useLocations } from "@/api/hooks";
import api from "@/api/client";
import { Building2, MapPin, Briefcase, Pencil, X, Plus, Trash2, Save } from "lucide-react";

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda",
  "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain",
  "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia",
  "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso",
  "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic",
  "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia",
  "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica",
  "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea",
  "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia",
  "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea",
  "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India",
  "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon",
  "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar",
  "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania",
  "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro",
  "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands",
  "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia",
  "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea",
  "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia",
  "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines",
  "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia",
  "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands",
  "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan",
  "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania",
  "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey",
  "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom",
  "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela",
  "Vietnam", "Yemen", "Zambia", "Zimbabwe",
];

const NAME_ONLY_RE = /^[A-Za-z\s\-'.]+$/;

const TIMEZONES = [
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Toronto", "America/Vancouver", "America/Sao_Paulo", "America/Mexico_City",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome",
  "Europe/Amsterdam", "Europe/Stockholm", "Europe/Warsaw", "Europe/Zurich",
  "Europe/Dublin", "Europe/Moscow",
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul",
  "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Bangkok", "Asia/Jakarta", "Asia/Manila",
  "Asia/Kuala_Lumpur", "Asia/Ho_Chi_Minh", "Asia/Riyadh",
  "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland",
  "Africa/Lagos", "Africa/Nairobi", "Africa/Cairo", "Africa/Johannesburg",
];

export default function SettingsPage() {
  const { data: org, isLoading } = useOrg();
  const { data: departments } = useDepartments();
  const { data: locations } = useLocations();
  const [editingOrg, setEditingOrg] = useState(false);

  if (isLoading) return <div className="text-gray-500">Loading settings...</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Organization Settings</h1>
        <p className="text-gray-500 mt-1">Manage your company details, departments, and locations.</p>
      </div>

      {/* Organization info */}
      {editingOrg ? (
        <OrgEditForm org={org} onClose={() => setEditingOrg(false)} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-brand-600" />
              <h2 className="font-semibold text-gray-900">Company Information</h2>
            </div>
            <button
              onClick={() => setEditingOrg(true)}
              className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
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
                <p className="text-sm font-medium text-gray-900">{value || "\u2014"}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Departments */}
        <DepartmentsCard departments={departments || []} />

        {/* Locations */}
        <LocationsCard locations={locations || []} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Organization Edit Form
// ---------------------------------------------------------------------------

function OrgEditForm({ org, onClose }: { org: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: org?.name || "",
    legal_name: org?.legal_name || "",
    email: org?.email || "",
    contact_number: org?.contact_number || "",
    country: org?.country || "",
    state: org?.state || "",
    city: org?.city || "",
    timezone: org?.timezone || "",
    language: org?.language || "",
  });

  const updateOrg = useMutation({
    mutationFn: (data: typeof form) =>
      api.put("/organizations/me", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org"] });
      onClose();
    },
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (form.city && !NAME_ONLY_RE.test(form.city)) {
      errors.city = "City must only contain letters, spaces, and hyphens.";
    }
    if (form.state && !NAME_ONLY_RE.test(form.state)) {
      errors.state = "State must only contain letters, spaces, and hyphens.";
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    updateOrg.mutate(form);
  };

  const fields: [string, keyof typeof form][] = [
    ["Name", "name"],
    ["Legal Name", "legal_name"],
    ["Email", "email"],
    ["Phone", "contact_number"],
    ["Country", "country"],
    ["State", "state"],
    ["City", "city"],
    ["Timezone", "timezone"],
    ["Language", "language"],
  ];

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-brand-600" />
          <h2 className="font-semibold text-gray-900">Edit Company Information</h2>
        </div>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {fields.map(([label, key]) => (
          <div key={key}>
            <label className="block text-xs text-gray-500 mb-1">{label}</label>
            {key === "timezone" ? (
              <select
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">Select timezone</option>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            ) : key === "country" ? (
              <select
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">Select country</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type={key === "email" ? "email" : "text"}
                  value={form[key]}
                  onChange={(e) => {
                    setForm({ ...form, [key]: e.target.value });
                    if (validationErrors[key]) {
                      setValidationErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm ${validationErrors[key] ? "border-red-400" : "border-gray-300"}`}
                />
                {validationErrors[key] && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors[key]}</p>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={updateOrg.isPending}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> Save Changes
        </button>
      </div>
      {updateOrg.isError && (
        <p className="mt-3 text-sm text-red-600">Failed to update. Please try again.</p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Departments Card with Add/Delete
// ---------------------------------------------------------------------------

function DepartmentsCard({ departments }: { departments: any[] }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState("");

  const addDept = useMutation({
    mutationFn: (name: string) =>
      api.post("/organizations/me/departments", { name }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      setNewName("");
      setShowAdd(false);
      setAddError("");
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.error?.message || "Failed to add department.");
    },
  });

  const deleteDept = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/organizations/me/departments/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Briefcase className="h-5 w-5 text-brand-600" />
          <h2 className="font-semibold text-gray-900">Departments ({departments.length})</h2>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      {showAdd && (
        <div className="mb-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAddError("");
              if (newName.trim()) addDept.mutate(newName.trim());
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setAddError(""); }}
              placeholder="Department name"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
            <button
              type="submit"
              disabled={addDept.isPending}
              className="px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              Add
            </button>
          </form>
          {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
        </div>
      )}
      <ul className="space-y-2">
        {departments.map((d: any) => (
          <li key={d.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
            {d.name}
            <button
              onClick={() => deleteDept.mutate(d.id)}
              className="text-gray-400 hover:text-red-500"
              title="Delete department"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locations Card with Add
// ---------------------------------------------------------------------------

function LocationsCard({ locations }: { locations: any[] }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [locForm, setLocForm] = useState({ name: "", timezone: "" });
  const [addError, setAddError] = useState("");

  const addLoc = useMutation({
    mutationFn: (data: { name: string; timezone?: string }) =>
      api.post("/organizations/me/locations", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      setLocForm({ name: "", timezone: "" });
      setShowAdd(false);
      setAddError("");
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.error?.message || "Failed to add location.");
    },
  });

  const deleteLoc = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/organizations/me/locations/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-brand-600" />
          <h2 className="font-semibold text-gray-900">Locations ({locations.length})</h2>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      {showAdd && (
        <div className="mb-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAddError("");
            if (locForm.name.trim()) {
              addLoc.mutate({
                name: locForm.name.trim(),
                timezone: locForm.timezone.trim() || undefined,
              });
            }
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={locForm.name}
            onChange={(e) => { setLocForm({ ...locForm, name: e.target.value }); setAddError(""); }}
            placeholder="Location name"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            required
          />
          <select
            value={locForm.timezone}
            onChange={(e) => setLocForm({ ...locForm, timezone: e.target.value })}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">Select timezone</option>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addLoc.isPending}
            className="px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            Add
          </button>
        </form>
        {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
        </div>
      )}
      <ul className="space-y-2">
        {locations.map((l: any) => (
          <li key={l.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
            <span>{l.name}</span>
            <div className="flex items-center gap-2">
              {l.timezone && <span className="text-xs text-gray-400">{l.timezone}</span>}
              <button
                onClick={() => deleteLoc.mutate(l.id)}
                className="text-gray-400 hover:text-red-500"
                title="Delete location"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
