import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg, useDepartments, useLocations } from "@/api/hooks";
import api from "@/api/client";
import { Building2, MapPin, Briefcase, Pencil, X, Plus, Trash2, Save } from "lucide-react";
import ChangePasswordCard from "@/components/ChangePasswordCard";
import ApiKeysCard from "@/components/ApiKeysCard";

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
  const { t } = useTranslation();
  const { data: org, isLoading } = useOrg();
  const { data: departments } = useDepartments();
  const { data: locations } = useLocations();
  const [editingOrg, setEditingOrg] = useState(false);

  if (isLoading) return <div className="text-gray-500">{t("orgSettings.loading")}</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t("orgSettings.title")}</h1>
        <p className="text-gray-500 mt-1">{t("orgSettings.subtitle")}</p>
      </div>

      {/* Organization info */}
      {editingOrg ? (
        <OrgEditForm org={org} onClose={() => setEditingOrg(false)} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-brand-600" />
              <h2 className="font-semibold text-gray-900">{t("orgSettings.companyInfo")}</h2>
            </div>
            <button
              onClick={() => setEditingOrg(true)}
              className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              <Pencil className="h-3.5 w-3.5" /> {t("orgSettings.edit")}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              ["name", org?.name],
              ["legalName", org?.legal_name],
              ["email", org?.email],
              ["phone", org?.contact_number],
              ["country", org?.country],
              ["state", org?.state],
              ["city", org?.city],
              ["timezone", org?.timezone],
              ["language", org?.language],
            ].map(([labelKey, value]) => (
              <div key={labelKey as string}>
                <p className="text-xs text-gray-500">{t(`orgSettings.field.${labelKey}`)}</p>
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

      {/* Programmatic access — org-admin-generated API keys that work across
          EmpCloud and the Payroll module. */}
      <ApiKeysCard />

      {/* Account security — same self-service password change card the
          /change-password route uses, embedded here so HR can change
          their password without leaving the settings flow. */}
      <div className="mt-6">
        <ChangePasswordCard />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Organization Edit Form
// ---------------------------------------------------------------------------

function OrgEditForm({ org, onClose }: { org: any; onClose: () => void }) {
  const { t } = useTranslation();
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
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = t("orgSettings.errEmail");
    }
    if (form.city && !NAME_ONLY_RE.test(form.city)) {
      errors.city = t("orgSettings.errCity");
    }
    if (form.state && !NAME_ONLY_RE.test(form.state)) {
      errors.state = t("orgSettings.errState");
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    updateOrg.mutate(form);
  };

  const fields: [string, keyof typeof form][] = [
    ["name", "name"],
    ["legalName", "legal_name"],
    ["email", "email"],
    ["phone", "contact_number"],
    ["country", "country"],
    ["state", "state"],
    ["city", "city"],
    ["timezone", "timezone"],
    ["language", "language"],
  ];

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-brand-600" />
          <h2 className="font-semibold text-gray-900">{t("orgSettings.editCompanyInfo")}</h2>
        </div>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {fields.map(([label, key]) => (
          <div key={key}>
            <label className="block text-xs text-gray-500 mb-1">{t(`orgSettings.field.${label}`)}</label>
            {key === "timezone" ? (
              <select
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">{t("orgSettings.selectTimezone")}</option>
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
                <option value="">{t("orgSettings.selectCountry")}</option>
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
          {t("orgSettings.cancel")}
        </button>
        <button
          type="submit"
          disabled={updateOrg.isPending}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {t("orgSettings.saveChanges")}
        </button>
      </div>
      {updateOrg.isError && (
        <p className="mt-3 text-sm text-red-600">{t("orgSettings.updateError")}</p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Departments Card with Add/Delete
// ---------------------------------------------------------------------------

function DepartmentsCard({ departments }: { departments: any[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState("");
  // editId = the department row currently in edit mode (null if none)
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editError, setEditError] = useState("");

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
      setAddError(err?.response?.data?.error?.message || t("orgSettings.addDeptError"));
    },
  });

  const updateDept = useMutation({
    mutationFn: (vars: { id: number; name: string }) =>
      api
        .put(`/organizations/me/departments/${vars.id}`, { name: vars.name })
        .then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      setEditId(null);
      setEditName("");
      setEditError("");
    },
    onError: (err: any) => {
      setEditError(err?.response?.data?.error?.message || t("orgSettings.renameDeptError"));
    },
  });

  const [deleteError, setDeleteError] = useState("");

  const deleteDept = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/organizations/me/departments/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      setDeleteError("");
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.error?.message || t("orgSettings.deleteDeptError"));
    },
  });

  const startEdit = (d: any) => {
    setEditId(d.id);
    setEditName(d.name);
    setEditError("");
  };
  const cancelEdit = () => {
    setEditId(null);
    setEditName("");
    setEditError("");
  };
  const saveEdit = () => {
    if (editId == null) return;
    const name = editName.trim();
    if (!name) return;
    updateDept.mutate({ id: editId, name });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Briefcase className="h-5 w-5 text-brand-600" />
          <h2 className="font-semibold text-gray-900">{t("orgSettings.departments", { count: departments.length })}</h2>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> {t("orgSettings.add")}
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
              placeholder={t("orgSettings.departmentName")}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
            <button
              type="submit"
              disabled={addDept.isPending}
              className="px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {t("orgSettings.add")}
            </button>
          </form>
          {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
        </div>
      )}
      <ul className="space-y-2">
        {departments.map((d: any) => (
          <li
            key={d.id}
            className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm"
          >
            {editId === d.id ? (
              <form
                className="flex-1 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveEdit();
                }}
              >
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setEditError("");
                  }}
                  autoFocus
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                  required
                />
                <button
                  type="submit"
                  disabled={updateDept.isPending || !editName.trim()}
                  className="text-green-600 hover:text-green-700 disabled:opacity-50"
                  title={t("orgSettings.save")}
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-gray-400 hover:text-gray-600"
                  title={t("orgSettings.cancel")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <>
                <span>{d.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(d)}
                    className="text-gray-400 hover:text-brand-600"
                    title={t("orgSettings.renameDepartment")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setDeleteError("");
                      deleteDept.mutate(d.id);
                    }}
                    className="text-gray-400 hover:text-red-500"
                    title={t("orgSettings.deleteDepartment")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {editError && <p className="text-xs text-red-500 mt-2">{editError}</p>}
      {deleteError && <p className="text-xs text-red-500 mt-2">{deleteError}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locations Card with Add
// ---------------------------------------------------------------------------

function LocationsCard({ locations }: { locations: any[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [locForm, setLocForm] = useState({ name: "", timezone: "" });
  const [addError, setAddError] = useState("");
  // Inline edit state — editId is the row currently open for edit (null = none)
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", timezone: "" });
  const [editError, setEditError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const addLoc = useMutation({
    mutationFn: (data: { name: string; timezone: string }) =>
      api.post("/organizations/me/locations", data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      setLocForm({ name: "", timezone: "" });
      setShowAdd(false);
      setAddError("");
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.error?.message || t("orgSettings.addLocError"));
    },
  });

  const updateLoc = useMutation({
    mutationFn: (vars: { id: number; name: string; timezone?: string }) =>
      api
        .put(`/organizations/me/locations/${vars.id}`, {
          name: vars.name,
          timezone: vars.timezone || undefined,
        })
        .then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      setEditId(null);
      setEditForm({ name: "", timezone: "" });
      setEditError("");
    },
    onError: (err: any) => {
      setEditError(err?.response?.data?.error?.message || t("orgSettings.updateLocError"));
    },
  });

  const deleteLoc = useMutation({
    mutationFn: (id: number) =>
      api.delete(`/organizations/me/locations/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      setDeleteError("");
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.error?.message || t("orgSettings.deleteLocError"));
    },
  });

  const startEdit = (l: any) => {
    setEditId(l.id);
    setEditForm({ name: l.name || "", timezone: l.timezone || "" });
    setEditError("");
  };
  const cancelEdit = () => {
    setEditId(null);
    setEditForm({ name: "", timezone: "" });
    setEditError("");
  };
  const saveEdit = () => {
    if (editId == null) return;
    const name = editForm.name.trim();
    if (!name) return;
    updateLoc.mutate({ id: editId, name, timezone: editForm.timezone.trim() });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-brand-600" />
          <h2 className="font-semibold text-gray-900">{t("orgSettings.locations", { count: locations.length })}</h2>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> {t("orgSettings.add")}
        </button>
      </div>
      {showAdd && (
        <div className="mb-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAddError("");
            const name = locForm.name.trim();
            const timezone = locForm.timezone.trim();
            if (!name) return;
            if (!timezone) {
              setAddError(t("orgSettings.timezoneRequired"));
              return;
            }
            addLoc.mutate({ name, timezone });
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={locForm.name}
            onChange={(e) => { setLocForm({ ...locForm, name: e.target.value }); setAddError(""); }}
            placeholder={t("orgSettings.locationName")}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            required
          />
          <select
            value={locForm.timezone}
            onChange={(e) => { setLocForm({ ...locForm, timezone: e.target.value }); setAddError(""); }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            required
            aria-required="true"
          >
            <option value="">{t("orgSettings.selectTimezoneRequired")}</option>
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
          <li
            key={l.id}
            className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm"
          >
            {editId === l.id ? (
              <form
                className="flex-1 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveEdit();
                }}
              >
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => {
                    setEditForm({ ...editForm, name: e.target.value });
                    setEditError("");
                  }}
                  autoFocus
                  placeholder={t("orgSettings.locationName")}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                  required
                />
                <select
                  value={editForm.timezone}
                  onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                >
                  <option value="">{t("orgSettings.noTimezone")}</option>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={updateLoc.isPending || !editForm.name.trim()}
                  className="text-green-600 hover:text-green-700 disabled:opacity-50"
                  title={t("orgSettings.save")}
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="text-gray-400 hover:text-gray-600"
                  title={t("orgSettings.cancel")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <>
                <span>{l.name}</span>
                <div className="flex items-center gap-2">
                  {l.timezone && <span className="text-xs text-gray-400">{l.timezone}</span>}
                  <button
                    onClick={() => startEdit(l)}
                    className="text-gray-400 hover:text-brand-600"
                    title={t("orgSettings.editLocation")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setDeleteError("");
                      deleteLoc.mutate(l.id);
                    }}
                    className="text-gray-400 hover:text-red-500"
                    title={t("orgSettings.deleteLocation")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {editError && <p className="text-xs text-red-500 mt-2">{editError}</p>}
      {deleteError && <p className="text-xs text-red-500 mt-2">{deleteError}</p>}
    </div>
  );
}
