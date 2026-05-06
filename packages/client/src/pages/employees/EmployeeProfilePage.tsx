import { useState, useEffect, useRef } from "react";
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
  Camera,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import CustomRolesField from "@/components/employees/CustomRolesField";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

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
  // per_page bumped to 500 so the Reporting Manager + Additional Managers
  // pickers see every active user in mid-size orgs. Without this the source
  // list silently capped at 100 (or worse, 20 if the param wasn't honoured),
  // and HR couldn't pick managers that fell outside that window.
  const { data: allUsers } = useQuery({
    queryKey: ["users-for-manager"],
    queryFn: () => api.get("/users", { params: { per_page: 500 } }).then((r) => r.data.data),
    enabled: editing,
  });

  // #1423 — departments and shifts for the HR-only edit dropdowns. We fetch
  // departments whenever the form is open (not just for HR) so self-service
  // users can see their own department's name in the disabled dropdown
  // instead of an empty list (emp-payroll#250 — was confusing because the
  // user couldn't tell whether they had no department or the dropdown was
  // broken).
  // /departments doesn't exist on the server — departments live under
  // /organizations/me/departments (same path every other page uses).
  // The wrong path silently returned 404 and the dropdown was empty.
  const { data: departments } = useQuery({
    queryKey: ["org-departments"],
    queryFn: () => api.get("/organizations/me/departments").then((r) => r.data.data),
    enabled: editing,
  });
  const { data: shifts } = useQuery({
    queryKey: ["attendance-shifts"],
    queryFn: () => api.get("/attendance/shifts").then((r) => r.data.data),
    enabled: editing && isHR,
  });

  const updateProfile = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.put(`/employees/${userId}/profile`, data).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-profile", userId] });
      setEditing(false);
    },
  });

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Load photo via authenticated API and convert to blob URL
  useEffect(() => {
    if (!isValidId) return;
    let revoked = false;
    api
      .get(`/employees/${userId}/photo`, { responseType: "blob" })
      .then((res) => {
        if (!revoked) {
          const url = URL.createObjectURL(res.data);
          setPhotoUrl(url);
        }
      })
      .catch(() => {
        // no photo — ignore
      });
    return () => {
      revoked = true;
    };
  }, [userId, isValidId]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      await api.post(`/employees/${userId}/photo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      // Fetch the new photo via authenticated API
      const res = await api.get(`/employees/${userId}/photo`, { responseType: "blob" });
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(URL.createObjectURL(res.data));
      // #1650 — Other components (org chart, directory, feed) load the same
      // photo via useEmployeePhoto, keyed on user_id. Bust that cache so
      // they re-fetch the new image instead of showing the stale one.
      queryClient.invalidateQueries({ queryKey: ["employee-photo", Number(userId)] });
      queryClient.invalidateQueries({ queryKey: ["employee-profile", userId] });
    } catch {
      // silently fail — photo not critical
    } finally {
      setUploadingPhoto(false);
    }
  };

  // #1650 — "Option to revert to initials avatar" from the issue. Calls the
  // server DELETE endpoint, drops the local objectURL, and busts the shared
  // photo query so every avatar across the app reverts to initials.
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const handlePhotoRemove = async () => {
    if (!photoUrl || removingPhoto) return;
    if (!confirm("Remove your profile photo? You'll show initials again.")) return;
    setRemovingPhoto(true);
    try {
      await api.delete(`/employees/${userId}/photo`);
      URL.revokeObjectURL(photoUrl);
      setPhotoUrl(null);
      queryClient.invalidateQueries({ queryKey: ["employee-photo", Number(userId)] });
      queryClient.invalidateQueries({ queryKey: ["employee-profile", userId] });
    } catch {
      // ignore — non-critical
    } finally {
      setRemovingPhoto(false);
    }
  };

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
          {/* Biometric face takes precedence — when the user has a kiosk-
              enrolled face, show that image and lock manual photo edits.
              The biometric image is the system of record (it gates kiosk
              attendance recognition) and HR shouldn't be able to swap it
              from a generic profile upload. */}
          {(() => {
            const hasBiometric = !!(profile as any).has_biometric_face;
            const photoEditable = canEdit && !hasBiometric;
            return (
              <>
                <div
                  className={`relative h-16 w-16 rounded-full bg-brand-100 flex items-center justify-center text-xl font-bold text-brand-700 overflow-hidden group ${
                    photoEditable ? "cursor-pointer" : "cursor-default"
                  }`}
                  onClick={() => photoEditable && photoInputRef.current?.click()}
                  title={
                    hasBiometric
                      ? "Photo is managed via biometric kiosk enrollment"
                      : undefined
                  }
                >
                  {hasBiometric ? (
                    <img
                      src={`/api/v3/biometric/face/${userId}.jpg`}
                      alt="Biometric face"
                      className="h-full w-full object-cover"
                    />
                  ) : photoUrl ? (
                    <img
                      src={photoUrl}
                      alt="Profile"
                      className="h-full w-full object-cover"
                      onError={() => setPhotoUrl(null)}
                    />
                  ) : (
                    <>
                      {profile.first_name?.[0]}
                      {profile.last_name?.[0]}
                    </>
                  )}
                  {photoEditable && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {uploadingPhoto ? (
                        <span className="text-white text-xs">...</span>
                      ) : (
                        <Camera className="h-5 w-5 text-white" />
                      )}
                    </div>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={!photoEditable}
                  />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    {profile.first_name} {profile.last_name}
                  </h1>
                  <p className="text-sm text-gray-500">{profile.designation || "No designation"}</p>
                  <p className="text-sm text-gray-400">{profile.email}</p>
                  {/* Hint when the photo comes from biometric enrollment —
                      explains why the upload affordance isn't there. */}
                  {hasBiometric && (
                    <p className="mt-1 text-xs text-gray-500">
                      Photo from biometric enrollment — managed via the kiosk.
                    </p>
                  )}
                  {/* #1650 — Remove photo only meaningful for the manual
                      upload path. Hidden when biometric is in use (HR can't
                      remove an enrolled face from this UI). */}
                  {photoEditable && photoUrl && (
                    <button
                      type="button"
                      onClick={handlePhotoRemove}
                      disabled={removingPhoto}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600 disabled:opacity-50"
                    >
                      {removingPhoto ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Removing...
                        </>
                      ) : (
                        "Remove photo"
                      )}
                    </button>
                  )}
                </div>
              </>
            );
          })()}
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
            departments={departments || []}
            shifts={shifts || []}
            userId={userId}
            selfService={isOwnProfile && !isHR}
          />
        )}
        {activeTab === "education" && <EducationTab data={education} userId={userId} canEdit={canEdit} />}
        {activeTab === "experience" && <ExperienceTab data={experience} userId={userId} canEdit={canEdit} />}
        {activeTab === "dependents" && <DependentsTab data={dependents} userId={userId} canEdit={canEdit} />}
        {activeTab === "addresses" && <AddressesTab data={addresses} userId={userId} canEdit={canEdit} />}
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

// Validation patterns for Indian identity documents
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const AADHAR_REGEX = /^[0-9]{12}$/;
const UAN_REGEX = /^[0-9]{12}$/; // EPFO Universal Account Number — always 12 digits
const PASSPORT_REGEX = /^[A-PR-WY][0-9]{7}$/; // Indian passport: 1 letter (excl. Q, X, Z), 7 digits

function validateIdDoc(
  field: "pan_number" | "aadhar_number" | "uan_number" | "passport_number",
  value: string,
): string | null {
  if (!value) return null; // empty is allowed (optional field)
  if (field === "pan_number") {
    return PAN_REGEX.test(value)
      ? null
      : "PAN must be 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)";
  }
  if (field === "aadhar_number") {
    return AADHAR_REGEX.test(value) ? null : "Aadhaar must be 12 digits";
  }
  if (field === "uan_number") {
    return UAN_REGEX.test(value) ? null : "UAN must be 12 digits";
  }
  if (field === "passport_number") {
    return PASSPORT_REGEX.test(value)
      ? null
      : "Passport must be 1 letter + 7 digits (e.g. A1234567)";
  }
  return null;
}

function PersonalTab({ profile, editing, onSave, saving, error, allUsers, departments, shifts, userId, selfService }: { profile: any; editing?: boolean; onSave?: (data: Record<string, unknown>) => void; saving?: boolean; error?: string | null; allUsers?: any[]; departments?: any[]; shifts?: any[]; userId?: number; selfService?: boolean }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [idErrors, setIdErrors] = useState<{ pan_number?: string; aadhar_number?: string; uan_number?: string; passport_number?: string }>({});
  // Bug fix: previously this effect depended on [editing, profile], so any
  // React Query refetch (window focus, stale-time, manual invalidation) handed
  // back a new `profile` object reference and the effect re-ran -- silently
  // overwriting in-flight user edits with whatever the server last returned.
  // The most visible symptom was selecting "No Manager" in the Reporting
  // Manager dropdown: the form state was reset to the prior manager id
  // before the user clicked Save, and the request sent the old value.
  // Initialise the form *once* per edit session by tracking initialisation
  // in a ref keyed off the editing flag, so refetches no longer clobber the
  // user's selection.
  const formInitialized = useRef(false);
  useEffect(() => {
    if (!editing) {
      setForm({});
      formInitialized.current = false;
      return;
    }
    if (profile && !formInitialized.current) {
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
        uan_number: profile.uan_number || "",
        passport_number: profile.passport_number || "",
        passport_expiry: profile.passport_expiry ? profile.passport_expiry.slice(0, 10) : "",
        visa_status: profile.visa_status || "",
        visa_expiry: profile.visa_expiry ? profile.visa_expiry.slice(0, 10) : "",
        emergency_contact_name: profile.emergency_contact_name || "",
        emergency_contact_phone: profile.emergency_contact_phone || "",
        emergency_contact_relation: profile.emergency_contact_relation || "",
        notice_period_days: profile.notice_period_days ? String(profile.notice_period_days) : "",
        reporting_manager_id: profile.reporting_manager_id ? String(profile.reporting_manager_id) : "",
        // #1423 / #1424 — department, designation, shift on the edit form.
        department_id: profile.department_id ? String(profile.department_id) : "",
        designation: profile.designation || "",
        shift_id: profile.shift_id ? String(profile.shift_id) : "",
        // emp-payroll#246 — employee code, HR-editable.
        emp_code: profile.emp_code || "",
      });
      formInitialized.current = true;
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
            {/* #1406 — DOB cannot be in the future */}
            <input type="date" max={new Date().toISOString().slice(0, 10)} value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className={canEditField("date_of_birth") ? inputClass : disabledClass} disabled={!canEditField("date_of_birth")} />
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
            <input
              type="text"
              value={form.aadhar_number}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                set("aadhar_number", digits);
                if (idErrors.aadhar_number) setIdErrors((p) => ({ ...p, aadhar_number: undefined }));
              }}
              onBlur={(e) => setIdErrors((p) => ({ ...p, aadhar_number: validateIdDoc("aadhar_number", e.target.value) || undefined }))}
              inputMode="numeric"
              maxLength={12}
              placeholder="12 digits"
              className={`${canEditField("aadhar_number") ? inputClass : disabledClass} ${idErrors.aadhar_number ? "border-red-500 focus:ring-red-500" : ""}`}
              disabled={!canEditField("aadhar_number")}
            />
            {idErrors.aadhar_number && <p className="text-xs text-red-600 mt-1">{idErrors.aadhar_number}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number</label>
            <input
              type="text"
              value={form.pan_number}
              onChange={(e) => {
                set("pan_number", e.target.value.toUpperCase().slice(0, 10));
                if (idErrors.pan_number) setIdErrors((p) => ({ ...p, pan_number: undefined }));
              }}
              onBlur={(e) => setIdErrors((p) => ({ ...p, pan_number: validateIdDoc("pan_number", e.target.value) || undefined }))}
              maxLength={10}
              placeholder="ABCDE1234F"
              className={`${canEditField("pan_number") ? inputClass : disabledClass} ${idErrors.pan_number ? "border-red-500 focus:ring-red-500" : ""}`}
              disabled={!canEditField("pan_number")}
            />
            {idErrors.pan_number && <p className="text-xs text-red-600 mt-1">{idErrors.pan_number}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">UAN Number</label>
            <input
              type="text"
              value={form.uan_number}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                set("uan_number", digits);
                if (idErrors.uan_number) setIdErrors((p) => ({ ...p, uan_number: undefined }));
              }}
              onBlur={(e) => setIdErrors((p) => ({ ...p, uan_number: validateIdDoc("uan_number", e.target.value) || undefined }))}
              inputMode="numeric"
              maxLength={12}
              placeholder="12 digits"
              className={`${canEditField("uan_number") ? inputClass : disabledClass} ${idErrors.uan_number ? "border-red-500 focus:ring-red-500" : ""}`}
              disabled={!canEditField("uan_number")}
            />
            {idErrors.uan_number && <p className="text-xs text-red-600 mt-1">{idErrors.uan_number}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passport Number</label>
            <input
              type="text"
              value={form.passport_number}
              onChange={(e) => {
                set("passport_number", e.target.value.toUpperCase().slice(0, 8));
                if (idErrors.passport_number) setIdErrors((p) => ({ ...p, passport_number: undefined }));
              }}
              onBlur={(e) => setIdErrors((p) => ({ ...p, passport_number: validateIdDoc("passport_number", e.target.value) || undefined }))}
              maxLength={8}
              placeholder="A1234567"
              className={`${canEditField("passport_number") ? inputClass : disabledClass} ${idErrors.passport_number ? "border-red-500 focus:ring-red-500" : ""}`}
              disabled={!canEditField("passport_number")}
            />
            {idErrors.passport_number && <p className="text-xs text-red-600 mt-1">{idErrors.passport_number}</p>}
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
              {(allUsers || [])
                .filter((u: any) => u.id !== userId && ["manager", "hr_admin", "org_admin", "super_admin"].includes(u.role))
                .map((u: any) => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role.replace("_", " ")}) - {u.email}</option>
                ))}
            </select>
          </div>
          {/* Additional Managers — RBAC v1. Stored in user_additional_managers
              and honoured by every `*:view_team` permission resolver. HR-only;
              employees see the list read-only. Excludes the current user and
              the primary manager from the picker. */}
          {userId !== undefined && (
            <div>
              <AdditionalManagersField
                userId={userId}
                allUsers={allUsers || []}
                primaryManagerId={form.reporting_manager_id ? Number(form.reporting_manager_id) : null}
                canEdit={!selfService}
              />
            </div>
          )}
          {userId !== undefined && (
            <div>
              <CustomRolesField userId={userId} canEdit={!selfService} />
            </div>
          )}
          {/* #1423 — Department (HR-only). Self-service users see a disabled
              dropdown so they're aware it exists but can't change it. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <select value={form.department_id} onChange={(e) => set("department_id", e.target.value)} className={!selfService ? inputClass : disabledClass} disabled={selfService}>
              <option value="">No department</option>
              {(departments || []).map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {/* #1423 — Shift (HR-only). Sent as shift_id; the server creates a
              user_shift_assignments row starting today when this changes. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
            <select value={form.shift_id} onChange={(e) => set("shift_id", e.target.value)} className={!selfService ? inputClass : disabledClass} disabled={selfService}>
              <option value="">No shift</option>
              {(shifts || []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {/* #1424 — Designation. HR can edit; employees see it read-only. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
            <input
              type="text"
              value={form.designation}
              onChange={(e) => set("designation", e.target.value)}
              className={!selfService ? inputClass : disabledClass}
              disabled={selfService}
              placeholder={selfService ? "Contact HR to change" : "e.g. Senior Engineer"}
            />
          </div>
          {/* emp-payroll#246 — Employee Code. HR-editable; employees see it
              read-only. Used downstream by emp-payroll for the My Profile
              header and the salary slip. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee Code</label>
            <input
              type="text"
              value={form.emp_code}
              onChange={(e) => set("emp_code", e.target.value)}
              className={!selfService ? inputClass : disabledClass}
              disabled={selfService}
              maxLength={50}
              placeholder={selfService ? "Contact HR to set" : "e.g. EMP001"}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => {
              const errs = {
                pan_number: validateIdDoc("pan_number", form.pan_number || "") || undefined,
                aadhar_number: validateIdDoc("aadhar_number", form.aadhar_number || "") || undefined,
                uan_number: validateIdDoc("uan_number", form.uan_number || "") || undefined,
                passport_number: validateIdDoc("passport_number", form.passport_number || "") || undefined,
              };
              if (errs.pan_number || errs.aadhar_number || errs.uan_number || errs.passport_number) {
                setIdErrors(errs);
                return;
              }
              onSave?.(Object.fromEntries(Object.entries(form).filter(([k]) => canEditField(k)).map(([k, v]) => [k, v || null])));
            }}
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
      <FieldRow label="UAN Number" value={profile.uan_number} />
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
      <AdditionalManagersReadRow userId={profile.id} />
      <CustomRolesReadRow userId={profile.id} />
      {/* #1423 / #1424 — surface designation, department and current shift in
          the read-only view so self-service employees can see them even if
          they can't edit them. */}
      <FieldRow label="Designation" value={profile.designation} />
      <FieldRow label="Employee Code" value={profile.emp_code} />
      <FieldRow label="Department" value={profile.department_name || (profile.department_id ? `Dept #${profile.department_id}` : null)} />
      <FieldRow label="Shift" value={profile.shift_name || (profile.shift_id ? `Shift #${profile.shift_id}` : null)} />
    </dl>
  );
}

// Read-only chip list of the user's assigned custom roles. Renders nothing
// when there are no custom roles so the summary stays compact.
function CustomRolesReadRow({ userId }: { userId?: number }) {
  const { data = [] } = useQuery<any[]>({
    queryKey: ["user-custom-roles", userId],
    queryFn: () =>
      api.get(`/roles/users/${userId}`).then((r) => r.data?.data ?? []),
    enabled: !!userId,
  });
  if (!Array.isArray(data) || data.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-x-4 py-2 border-b border-gray-100">
      <dt className="text-sm font-medium text-gray-500 col-span-1">Custom Roles</dt>
      <dd className="text-sm text-gray-900 col-span-2 flex flex-wrap gap-1.5">
        {data.map((r: any) => (
          <span
            key={r.id}
            title={r.description || undefined}
            className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-xs text-brand-700"
          >
            {r.name}
          </span>
        ))}
      </dd>
    </div>
  );
}

// Read-only chip list for the profile summary view. Renders nothing when the
// user has no additional managers so the summary stays compact. Uses the
// `managers` array enriched server-side so we don't depend on a paginated
// /users list to look up names.
function AdditionalManagersReadRow({ userId }: { userId?: number }) {
  const { data } = useQuery({
    queryKey: ["employee-additional-managers", userId],
    queryFn: () =>
      api.get(`/employees/${userId}/additional-managers`).then((r) => r.data?.data),
    enabled: !!userId,
  });
  const managers: Array<{ id: number; first_name: string; last_name: string; role: string }> =
    Array.isArray(data?.managers) ? data.managers : [];
  if (managers.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-x-4 py-2 border-b border-gray-100">
      <dt className="text-sm font-medium text-gray-500 col-span-1">Additional Managers</dt>
      <dd className="text-sm text-gray-900 col-span-2 flex flex-wrap gap-1.5">
        {managers.map((u) => (
          <span
            key={u.id}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-700"
          >
            <span className="h-5 w-5 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[10px] font-semibold">
              {u.first_name?.[0] || "?"}{u.last_name?.[0] || ""}
            </span>
            {u.first_name} {u.last_name}
          </span>
        ))}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared form helpers for sub-resource tabs (#1390)
// ---------------------------------------------------------------------------

const subInputClass =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

function SubResourceError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-3">
      {error}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Additional Managers field — RBAC v1
// Searchable multi-select with chips. Read-only mode renders the chips alone.
// ---------------------------------------------------------------------------

function AdditionalManagersField({
  userId,
  allUsers,
  primaryManagerId,
  canEdit,
}: {
  userId: number;
  allUsers: any[];
  primaryManagerId: number | null;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["employee-additional-managers", userId],
    queryFn: () =>
      api.get(`/employees/${userId}/additional-managers`).then((r) => r.data?.data),
    enabled: !!userId,
  });

  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => {
    setSelected(Array.isArray(data?.manager_ids) ? data.manager_ids : []);
  }, [data]);

  const mutation = useMutation({
    mutationFn: (ids: number[]) =>
      api.put(`/employees/${userId}/additional-managers`, { manager_ids: ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-additional-managers", userId] });
    },
  });

  // Lookup map for chip labels: prefer the enriched managers from the
  // /additional-managers response (server-side join) so we're not limited to
  // the paginated /users list. Fallback to allUsers for newly-added rows
  // (which won't be in the response until save).
  const usersById = new Map<number, any>();
  for (const u of allUsers || []) usersById.set(u.id, u);
  for (const m of (data?.managers || []) as any[]) usersById.set(m.id, m);

  // Candidate pool: anyone in the org except self, primary manager, or
  // already-selected. Used by the search dropdown.
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const candidates = (allUsers || []).filter(
    (u: any) =>
      u.id !== userId &&
      (primaryManagerId == null || u.id !== primaryManagerId) &&
      !selected.includes(u.id),
  );

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    // Drop the empty-browse cap entirely (was 50). The earlier cap hid
    // people who happened to live past the 50th position in the API's
    // status DESC, created_at DESC order -- e.g. an employee created
    // weeks ago in an org with > 50 newer actives never appeared in the
    // browse view, even though the API returned them. The dropdown is
    // already scrollable (max-h-60 overflow-y-auto) so showing the full
    // candidate set is fine; max(allUsers) is 500 (per_page cap on /users)
    // so we render at most ~498 rows after self/primary/selected filtering.
    if (!q) return candidates;
    return candidates.filter((u: any) => {
      const name = `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase();
      return name.includes(q) || (u.email || "").toLowerCase().includes(q);
    });
  })();

  const add = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuery("");
  };
  const remove = (id: number) => {
    if (!canEdit) return;
    setSelected((prev) => prev.filter((x) => x !== id));
  };

  const dirty =
    selected.length !== (data?.manager_ids || []).length ||
    selected.some((id) => !(data?.manager_ids || []).includes(id));

  // Read-only mode: just chips, no search UI.
  if (!canEdit) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Additional Managers
        </label>
        <div className="min-h-[40px] flex flex-wrap items-center gap-1.5 border border-gray-200 rounded-md bg-gray-50 px-2 py-2">
          {isLoading ? (
            <span className="text-sm text-gray-400">Loading…</span>
          ) : selected.length === 0 ? (
            <span className="text-sm text-gray-400">No additional managers</span>
          ) : (
            selected.map((id) => {
              const u = usersById.get(id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white border border-gray-200 text-xs text-gray-700"
                >
                  <span className="h-5 w-5 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[10px] font-semibold">
                    {(u?.first_name?.[0] || "?")}{(u?.last_name?.[0] || "")}
                  </span>
                  <span className="truncate max-w-[160px]">
                    {u ? `${u.first_name} ${u.last_name}` : `User #${id}`}
                  </span>
                </span>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Editable mode: chips + search + save.
  return (
    <div ref={containerRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Additional Managers
        {selected.length > 0 && (
          <span className="ml-2 text-xs font-normal text-gray-400">
            ({selected.length} selected)
          </span>
        )}
      </label>
      <p className="text-xs text-gray-500 mb-2">
        Co-managers with the same team-scope access as the primary Reporting
        Manager. Honoured by every team-scoped permission.
      </p>

      {/* Selected-chips + search input wrapper */}
      <div
        className="relative min-h-[42px] border border-gray-300 rounded-md bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500"
        onClick={() => setOpen(true)}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((id) => {
            const u = usersById.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-xs text-brand-700"
              >
                <span className="h-5 w-5 rounded-full bg-brand-200 text-brand-800 flex items-center justify-center text-[10px] font-semibold">
                  {(u?.first_name?.[0] || "?")}{(u?.last_name?.[0] || "")}
                </span>
                <span className="truncate max-w-[160px]">
                  {u ? `${u.first_name} ${u.last_name}` : `User #${id}`}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remove(id); }}
                  className="ml-0.5 h-4 w-4 flex items-center justify-center rounded-full hover:bg-brand-200"
                  aria-label={`Remove ${u ? `${u.first_name} ${u.last_name}` : "manager"}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={selected.length === 0 ? "Search by name or email…" : "Add another…"}
            className="flex-1 min-w-[140px] outline-none text-sm py-0.5 bg-transparent"
          />
        </div>

        {/* Dropdown */}
        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">
                {query ? "No matching users" : "All eligible users already selected"}
              </div>
            ) : (
              filtered.map((u: any) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => add(u.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-brand-50 text-left"
                >
                  <span className="h-7 w-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {(u.first_name?.[0] || "?")}{(u.last_name?.[0] || "")}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-gray-900 truncate">
                      {u.first_name} {u.last_name}
                      {u.role && (
                        <span className="ml-1.5 text-xs text-gray-400">
                          · {u.role.replace("_", " ")}
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-gray-400 truncate">{u.email}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Save row */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => mutation.mutate(selected)}
          disabled={!dirty || mutation.isPending}
          className="px-3 py-1.5 text-sm font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Save additional managers"}
        </button>
        {dirty && !mutation.isPending && (
          <span className="text-xs text-amber-600">unsaved changes</span>
        )}
        {mutation.isSuccess && !dirty && (
          <span className="text-xs text-green-600">Saved</span>
        )}
        {mutation.isError && (
          <span className="text-xs text-red-600">{extractApiError(mutation.error)}</span>
        )}
      </div>
    </div>
  );
}


function extractApiError(err: any): string {
  const resp = err?.response?.data?.error;
  const details: any[] = Array.isArray(resp?.details) ? resp.details : [];
  if (details.length > 0) {
    return details
      .map((d) => (d?.path?.length ? `${d.path.join(".")}: ${d?.message || ""}` : d?.message || ""))
      .filter(Boolean)
      .join("; ");
  }
  return resp?.message || err?.message || "Request failed";
}

// ---------------------------------------------------------------------------
// Education Tab
// ---------------------------------------------------------------------------

function EducationTab({ data, userId, canEdit }: { data?: any[]; userId: number; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["employee-education", userId] });

  function buildPayload() {
    return {
      degree: form.degree?.trim() || "",
      institution: form.institution?.trim() || "",
      field_of_study: form.field_of_study?.trim() || null,
      start_year: form.start_year ? Number(form.start_year) : null,
      end_year: form.end_year ? Number(form.end_year) : null,
      grade: form.grade?.trim() || null,
    };
  }

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post(`/employees/${userId}/education`, payload),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: any) => setError(extractApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      api.put(`/employees/${userId}/education/${id}`, payload),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: any) => setError(extractApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/employees/${userId}/education/${id}`),
    onSuccess: () => invalidate(),
    onError: (err: any) => setError(extractApiError(err)),
  });

  function resetForm() {
    setForm({});
    setAdding(false);
    setEditingId(null);
    setError(null);
  }

  function startAdd() {
    setForm({});
    setEditingId(null);
    setAdding(true);
    setError(null);
  }

  function startEdit(edu: any) {
    setForm({
      degree: edu.degree || "",
      institution: edu.institution || "",
      field_of_study: edu.field_of_study || "",
      start_year: edu.start_year ? String(edu.start_year) : "",
      end_year: edu.end_year ? String(edu.end_year) : "",
      grade: edu.grade || "",
    });
    setEditingId(edu.id);
    setAdding(false);
    setError(null);
  }

  function handleSave() {
    setError(null);
    const payload = buildPayload();
    if (!payload.degree || !payload.institution) {
      setError("Degree and Institution are required");
      return;
    }
    // #1405 — end year must not be before start year
    if (
      payload.start_year != null &&
      payload.end_year != null &&
      payload.end_year < payload.start_year
    ) {
      setError("End year must be on or after start year");
      return;
    }
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this education record?")) return;
    deleteMutation.mutate(id);
  }

  const showForm = adding || editingId !== null;
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      {canEdit && !showForm && (
        <div className="flex justify-end mb-4">
          <button
            onClick={startAdd}
            className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Add Education
          </button>
        </div>
      )}

      {showForm && (
        <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            {editingId ? "Edit Education" : "Add Education"}
          </h4>
          <SubResourceError error={error} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Degree *</label>
              <input
                value={form.degree || ""}
                onChange={(e) => setForm({ ...form, degree: e.target.value })}
                className={subInputClass}
                placeholder="e.g. B.Tech"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Institution *</label>
              <input
                value={form.institution || ""}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
                className={subInputClass}
                placeholder="e.g. IIT Delhi"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Field of Study</label>
              <input
                value={form.field_of_study || ""}
                onChange={(e) => setForm({ ...form, field_of_study: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Grade</label>
              <input
                value={form.grade || ""}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Year</label>
              <input
                type="number"
                value={form.start_year || ""}
                onChange={(e) => setForm({ ...form, start_year: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Year</label>
              <input
                type="number"
                value={form.end_year || ""}
                onChange={(e) => setForm({ ...form, end_year: e.target.value })}
                className={subInputClass}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </div>
      )}

      {!data || data.length === 0 ? (
        !showForm && <p className="text-sm text-gray-400">No education records added yet.</p>
      ) : (
        <div className="space-y-4">
          {data.map((edu: any) => (
            <div key={edu.id} className="border border-gray-100 rounded-lg p-4 flex items-start justify-between">
              <div className="flex-1">
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
              {canEdit && (
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => startEdit(edu)}
                    className="p-1.5 text-gray-400 hover:text-brand-600 rounded hover:bg-gray-100"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(edu.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Experience Tab
// ---------------------------------------------------------------------------

function ExperienceTab({ data, userId, canEdit }: { data?: any[]; userId: number; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<{ company_name: string; designation: string; start_date: string; end_date: string; is_current: boolean; description: string }>({
    company_name: "",
    designation: "",
    start_date: "",
    end_date: "",
    is_current: false,
    description: "",
  });
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["employee-experience", userId] });

  function buildPayload() {
    return {
      company_name: form.company_name.trim(),
      designation: form.designation.trim(),
      start_date: form.start_date,
      end_date: form.is_current ? null : (form.end_date || null),
      is_current: form.is_current,
      description: form.description.trim() || null,
    };
  }

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post(`/employees/${userId}/experience`, payload),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: any) => setError(extractApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      api.put(`/employees/${userId}/experience/${id}`, payload),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: any) => setError(extractApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/employees/${userId}/experience/${id}`),
    onSuccess: () => invalidate(),
    onError: (err: any) => setError(extractApiError(err)),
  });

  function resetForm() {
    setForm({ company_name: "", designation: "", start_date: "", end_date: "", is_current: false, description: "" });
    setAdding(false);
    setEditingId(null);
    setError(null);
  }

  function startAdd() {
    resetForm();
    setAdding(true);
  }

  function startEdit(exp: any) {
    setForm({
      company_name: exp.company_name || "",
      designation: exp.designation || "",
      start_date: exp.start_date ? String(exp.start_date).slice(0, 10) : "",
      end_date: exp.end_date ? String(exp.end_date).slice(0, 10) : "",
      is_current: !!exp.is_current,
      description: exp.description || "",
    });
    setEditingId(exp.id);
    setAdding(false);
    setError(null);
  }

  function handleSave() {
    setError(null);
    if (!form.company_name.trim() || !form.designation.trim() || !form.start_date) {
      setError("Company, Designation and Start Date are required");
      return;
    }
    const payload = buildPayload();
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this experience record?")) return;
    deleteMutation.mutate(id);
  }

  const showForm = adding || editingId !== null;
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      {canEdit && !showForm && (
        <div className="flex justify-end mb-4">
          <button
            onClick={startAdd}
            className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Add Experience
          </button>
        </div>
      )}

      {showForm && (
        <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            {editingId ? "Edit Experience" : "Add Experience"}
          </h4>
          <SubResourceError error={error} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company *</label>
              <input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Designation *</label>
              <input
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                disabled={form.is_current}
                className={form.is_current ? `${subInputClass} bg-gray-100 cursor-not-allowed` : subInputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_current}
                  onChange={(e) => setForm({ ...form, is_current: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600"
                />
                Currently working here
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={subInputClass}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </div>
      )}

      {!data || data.length === 0 ? (
        !showForm && <p className="text-sm text-gray-400">No work experience records added yet.</p>
      ) : (
        <div className="space-y-4">
          {data.map((exp: any) => (
            <div key={exp.id} className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
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
                {canEdit && (
                  <div className="flex items-center gap-1 ml-3">
                    <button
                      onClick={() => startEdit(exp)}
                      className="p-1.5 text-gray-400 hover:text-brand-600 rounded hover:bg-gray-100"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(exp.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dependents Tab
// ---------------------------------------------------------------------------

function DependentsTab({ data, userId, canEdit }: { data?: any[]; userId: number; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<{ name: string; relationship: string; date_of_birth: string; gender: string; is_nominee: boolean; nominee_percentage: string }>({
    name: "",
    relationship: "",
    date_of_birth: "",
    gender: "",
    is_nominee: false,
    nominee_percentage: "",
  });
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["employee-dependents", userId] });

  function buildPayload() {
    const payload: any = {
      name: form.name.trim(),
      relationship: form.relationship.trim(),
      date_of_birth: form.date_of_birth || null,
      is_nominee: form.is_nominee,
    };
    if (form.gender) payload.gender = form.gender;
    if (form.is_nominee && form.nominee_percentage !== "") {
      payload.nominee_percentage = Number(form.nominee_percentage);
    }
    return payload;
  }

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post(`/employees/${userId}/dependents`, payload),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: any) => setError(extractApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      api.put(`/employees/${userId}/dependents/${id}`, payload),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: any) => setError(extractApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/employees/${userId}/dependents/${id}`),
    onSuccess: () => invalidate(),
    onError: (err: any) => setError(extractApiError(err)),
  });

  function resetForm() {
    setForm({ name: "", relationship: "", date_of_birth: "", gender: "", is_nominee: false, nominee_percentage: "" });
    setAdding(false);
    setEditingId(null);
    setError(null);
  }

  function startAdd() {
    resetForm();
    setAdding(true);
  }

  function startEdit(dep: any) {
    setForm({
      name: dep.name || "",
      relationship: dep.relationship || "",
      date_of_birth: dep.date_of_birth ? String(dep.date_of_birth).slice(0, 10) : "",
      gender: dep.gender || "",
      is_nominee: !!dep.is_nominee,
      nominee_percentage: dep.nominee_percentage != null ? String(dep.nominee_percentage) : "",
    });
    setEditingId(dep.id);
    setAdding(false);
    setError(null);
  }

  function handleSave() {
    setError(null);
    if (!form.name.trim() || !form.relationship.trim()) {
      setError("Name and Relationship are required");
      return;
    }
    const payload = buildPayload();
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this dependent?")) return;
    deleteMutation.mutate(id);
  }

  const showForm = adding || editingId !== null;
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      {canEdit && !showForm && (
        <div className="flex justify-end mb-4">
          <button
            onClick={startAdd}
            className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Add Dependent
          </button>
        </div>
      )}

      {showForm && (
        <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            {editingId ? "Edit Dependent" : "Add Dependent"}
          </h4>
          <SubResourceError error={error} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Relationship *</label>
              <input
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                placeholder="e.g. Spouse, Child, Parent"
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date of Birth</label>
              {/* #1406 — DOB cannot be in the future */}
              <input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Gender</label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                className={subInputClass}
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
                <input
                  type="checkbox"
                  checked={form.is_nominee}
                  onChange={(e) => setForm({ ...form, is_nominee: e.target.checked })}
                  className="rounded border-gray-300 text-brand-600"
                />
                Is Nominee
              </label>
            </div>
            {form.is_nominee && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nominee %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.nominee_percentage}
                  onChange={(e) => setForm({ ...form, nominee_percentage: e.target.value })}
                  className={subInputClass}
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </div>
      )}

      {!data || data.length === 0 ? (
        !showForm && <p className="text-sm text-gray-400">No dependents added yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Relationship</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">DOB</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Gender</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Nominee</th>
                {canEdit && <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-2">Actions</th>}
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
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(dep)}
                          className="p-1.5 text-gray-400 hover:text-brand-600 rounded hover:bg-gray-100"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(dep.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Addresses Tab
// ---------------------------------------------------------------------------

function AddressesTab({ data, userId, canEdit }: { data?: any[]; userId: number; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<{ type: string; line1: string; line2: string; city: string; state: string; country: string; zipcode: string }>({
    type: "current",
    line1: "",
    line2: "",
    city: "",
    state: "",
    country: "IN",
    zipcode: "",
  });
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["employee-addresses", userId] });

  function buildPayload() {
    return {
      type: form.type,
      line1: form.line1.trim(),
      line2: form.line2.trim() || null,
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim() || "IN",
      zipcode: form.zipcode.trim(),
    };
  }

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post(`/employees/${userId}/addresses`, payload),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: any) => setError(extractApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      api.put(`/employees/${userId}/addresses/${id}`, payload),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: any) => setError(extractApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/employees/${userId}/addresses/${id}`),
    onSuccess: () => invalidate(),
    onError: (err: any) => setError(extractApiError(err)),
  });

  function resetForm() {
    setForm({ type: "current", line1: "", line2: "", city: "", state: "", country: "IN", zipcode: "" });
    setAdding(false);
    setEditingId(null);
    setError(null);
  }

  function startAdd() {
    resetForm();
    setAdding(true);
  }

  function startEdit(addr: any) {
    setForm({
      type: addr.type || "current",
      line1: addr.line1 || "",
      line2: addr.line2 || "",
      city: addr.city || "",
      state: addr.state || "",
      country: addr.country || "IN",
      zipcode: addr.zipcode || "",
    });
    setEditingId(addr.id);
    setAdding(false);
    setError(null);
  }

  function handleSave() {
    setError(null);
    if (!form.line1.trim() || !form.city.trim() || !form.state.trim() || !form.zipcode.trim()) {
      setError("Address line 1, City, State and Zipcode are required");
      return;
    }
    const payload = buildPayload();
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this address?")) return;
    deleteMutation.mutate(id);
  }

  const showForm = adding || editingId !== null;
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      {canEdit && !showForm && (
        <div className="flex justify-end mb-4">
          <button
            onClick={startAdd}
            className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> Add Address
          </button>
        </div>
      )}

      {showForm && (
        <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            {editingId ? "Edit Address" : "Add Address"}
          </h4>
          <SubResourceError error={error} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={subInputClass}
              >
                <option value="current">Current</option>
                <option value="permanent">Permanent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 1 *</label>
              <input
                value={form.line1}
                onChange={(e) => setForm({ ...form, line1: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 2</label>
              <input
                value={form.line2}
                onChange={(e) => setForm({ ...form, line2: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">City *</label>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">State *</label>
              <input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Zipcode *</label>
              {/* #1407 — zipcode must be digits only */}
              <input
                inputMode="numeric"
                pattern="\d*"
                value={form.zipcode}
                onChange={(e) => setForm({ ...form, zipcode: e.target.value.replace(/\D/g, "") })}
                className={subInputClass}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </div>
      )}

      {!data || data.length === 0 ? (
        !showForm && <p className="text-sm text-gray-400">No addresses added yet.</p>
      ) : (
        <div className="space-y-4">
          {data.map((addr: any) => (
            <div key={addr.id} className="border border-gray-100 rounded-lg p-4 flex items-start justify-between">
              <div className="flex-1">
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
              {canEdit && (
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => startEdit(addr)}
                    className="p-1.5 text-gray-400 hover:text-brand-600 rounded hover:bg-gray-100"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(addr.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
