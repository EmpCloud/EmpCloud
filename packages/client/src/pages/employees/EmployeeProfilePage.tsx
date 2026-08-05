import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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
import { usePermissions } from "@/lib/use-permissions";
import CustomRolesField from "@/components/employees/CustomRolesField";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const HR_ROLES = ["hr_admin", "org_admin", "super_admin"];

type Tab = "personal" | "education" | "experience" | "dependents" | "addresses" | "custom";

const TABS: { key: Tab; labelKey: string; icon: React.ElementType }[] = [
  { key: "personal", labelKey: "employeeProfile.tabs.personal", icon: User },
  { key: "education", labelKey: "employeeProfile.tabs.education", icon: GraduationCap },
  { key: "experience", labelKey: "employeeProfile.tabs.experience", icon: Briefcase },
  { key: "dependents", labelKey: "employeeProfile.tabs.dependents", icon: Users },
  { key: "addresses", labelKey: "employeeProfile.tabs.addresses", icon: MapPin },
  { key: "custom", labelKey: "employeeProfile.tabs.custom", icon: SlidersHorizontal },
];

export default function EmployeeProfilePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("personal");
  const [editing, setEditing] = useState(false);
  const currentUser = useAuthStore((s) => s.user);
  const { has } = usePermissions();

  const isOwnProfile = currentUser?.id === userId;
  const isHR = currentUser ? HR_ROLES.includes(currentUser.role) : false;

  // RBAC: viewing / editing is gated by permissions, not identity alone.
  // Own profile → employees:view / employees:edit_own; anyone else → the
  // org-wide employees:view_all|view_team / employees:edit_all. Previously
  // `isOwnProfile || isHR` let an employee keep viewing and editing their
  // own profile even after those permissions were revoked. super_admin
  // bypasses inside usePermissions.
  const canViewProfile = isOwnProfile
    ? has("employees:view", "employees:view_all", "employees:view_team")
    : has("employees:view_all", "employees:view_team");
  const canEdit = isOwnProfile
    ? has("employees:edit_own", "employees:edit_all")
    : has("employees:edit_all");

  const isValidId = !!id && !isNaN(userId);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["employee-profile", userId],
    queryFn: () => api.get(`/employees/${userId}/profile`).then((r) => r.data.data),
    enabled: isValidId && canViewProfile,
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
    enabled: editing && has("employees:edit_all", "employees:view_all", "employees:invite"),
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
    if (!isValidId || !canViewProfile) return;
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
  }, [userId, isValidId, canViewProfile]);

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
  // Confirm-dialog state (replaces window.confirm for removing the profile photo).
  const [showRemovePhoto, setShowRemovePhoto] = useState(false);
  const handlePhotoRemove = async () => {
    if (!photoUrl || removingPhoto) return;
    setShowRemovePhoto(false);
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
        <User className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h2 className="text-lg font-semibold text-muted-foreground mb-1">{t("employeeProfile.invalid.title")}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t("employeeProfile.invalid.description")}</p>
        <Link to="/employees" className="text-brand-600 dark:text-brand-400 text-sm font-medium hover:text-brand-700 dark:hover:text-brand-300">
          {t("employeeProfile.invalid.backToDirectory")}
        </Link>
      </div>
    );
  }

  if (!canViewProfile) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <User className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h2 className="text-lg font-semibold text-muted-foreground mb-1">{t("employeeProfile.accessDenied.title")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t("employeeProfile.accessDenied.description")}
        </p>
        <Link to="/" className="text-brand-600 dark:text-brand-400 text-sm font-medium hover:text-brand-700 dark:hover:text-brand-300">
          {t("employeeProfile.accessDenied.backToDashboard")}
        </Link>
      </div>
    );
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {t("employeeProfile.loading")}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {t("employeeProfile.notFound")}
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <Link
        to="/employees"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-600 dark:hover:text-brand-400 mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> {t("employeeProfile.header.backToDirectory")}
      </Link>

      {/* Header */}
      <div className="bg-card rounded-lg border border-border p-4 mb-6">
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
                  className={`relative h-16 w-16 rounded-full bg-brand-100 dark:bg-brand-950/40 flex items-center justify-center text-xl font-bold text-brand-700 dark:text-brand-300 overflow-hidden group ${
                    photoEditable ? "cursor-pointer" : "cursor-default"
                  }`}
                  onClick={() => photoEditable && photoInputRef.current?.click()}
                  title={
                    hasBiometric
                      ? t("employeeProfile.header.biometricPhotoTooltip")
                      : undefined
                  }
                >
                  {hasBiometric ? (
                    <img
                      src={`/api/v3/biometric/face/${userId}.jpg`}
                      alt={t("employeeProfile.header.biometricFaceAlt")}
                      className="h-full w-full object-cover"
                    />
                  ) : photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={t("employeeProfile.header.profilePhotoAlt")}
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
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">
                    {profile.first_name} {profile.last_name}
                  </h1>
                  <p className="text-sm text-muted-foreground">{profile.designation || t("employeeProfile.header.noDesignation")}</p>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                  {/* Hint when the photo comes from biometric enrollment —
                      explains why the upload affordance isn't there. */}
                  {hasBiometric && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("employeeProfile.header.biometricHint")}
                    </p>
                  )}
                  {/* #1650 — Remove photo only meaningful for the manual
                      upload path. Hidden when biometric is in use (HR can't
                      remove an enrolled face from this UI). */}
                  {photoEditable && photoUrl && (
                    <button
                      type="button"
                      onClick={() => setShowRemovePhoto(true)}
                      disabled={removingPhoto}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                    >
                      {removingPhoto ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> {t("employeeProfile.header.removingPhoto")}
                        </>
                      ) : (
                        t("employeeProfile.header.removePhoto")
                      )}
                    </button>
                  )}
                </div>
              </>
            );
          })()}
          <div className="ml-auto flex items-start gap-4">
            <div className="text-right text-sm text-muted-foreground">
              {profile.emp_code && <p>{t("employeeProfile.header.empCode", { code: profile.emp_code })}</p>}
              {profile.date_of_joining && (
                <p>{t("employeeProfile.header.joined", { date: new Date(profile.date_of_joining).toLocaleDateString() })}</p>
              )}
            </div>
            {activeTab === "personal" && canEdit && (
              <button
                onClick={() => setEditing(!editing)}
                className="flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 border border-brand-200 dark:border-brand-900 px-3 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-950/40"
              >
                <Pencil className="h-3.5 w-3.5" />
                {editing ? t("employeeProfile.header.cancel") : isOwnProfile && !isHR ? t("employeeProfile.header.editMyInfo") : t("employeeProfile.header.editProfile")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <nav className="flex gap-6">
          {TABS.map(({ key, labelKey, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-brand-600 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-card rounded-lg border border-border p-4">
        {activeTab === "personal" && (
          <PersonalTab
            profile={profile}
            editing={editing}
            onSave={(data: Record<string, unknown>) => updateProfile.mutate(data)}
            saving={updateProfile.isPending}
            error={updateProfile.isError ? ((updateProfile.error as any)?.response?.data?.error?.message || t("employeeProfile.personal.saveError")) : null}
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

      <ConfirmDialog
        open={showRemovePhoto}
        title={t("employeeProfile.removePhotoDialog.title")}
        description={t("employeeProfile.removePhotoDialog.description")}
        confirmText={t("employeeProfile.removePhotoDialog.confirm")}
        variant="danger"
        loading={removingPhoto}
        onConfirm={handlePhotoRemove}
        onCancel={() => setShowRemovePhoto(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Components
// ---------------------------------------------------------------------------

function FieldRow({ label, value }: { label: string; value?: string | number | null }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 py-3 border-b border-border last:border-0">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm text-foreground">{value || t("employeeProfile.field.emptyValue")}</dd>
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
  t: (key: string) => string,
): string | null {
  if (!value) return null; // empty is allowed (optional field)
  if (field === "pan_number") {
    return PAN_REGEX.test(value)
      ? null
      : t("employeeProfile.validation.pan");
  }
  if (field === "aadhar_number") {
    return AADHAR_REGEX.test(value) ? null : t("employeeProfile.validation.aadhar");
  }
  if (field === "uan_number") {
    return UAN_REGEX.test(value) ? null : t("employeeProfile.validation.uan");
  }
  if (field === "passport_number") {
    return PASSPORT_REGEX.test(value)
      ? null
      : t("employeeProfile.validation.passport");
  }
  return null;
}

function PersonalTab({ profile, editing, onSave, saving, error, allUsers, departments, shifts, userId, selfService }: { profile: any; editing?: boolean; onSave?: (data: Record<string, unknown>) => void; saving?: boolean; error?: string | null; allUsers?: any[]; departments?: any[]; shifts?: any[]; userId?: number; selfService?: boolean }) {
  const { t } = useTranslation();
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
    const inputClass = "w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500";
    const disabledClass = "w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted text-muted-foreground cursor-not-allowed";

    // Self-service employees can only edit personal/contact fields, not admin fields
    const SELF_SERVICE_FIELDS = [
      "personal_email", "contact_number", "gender", "date_of_birth",
      "blood_group", "marital_status", "nationality",
      "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
    ];
    const canEditField = (field: string) => !selfService || SELF_SERVICE_FIELDS.includes(field);

    return (
      <div>
        {error && <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm p-3 rounded-lg mb-4">{error}</div>}
        {selfService && (
          <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-sm p-3 rounded-lg mb-4">
            {t("employeeProfile.personal.selfServiceNotice")}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.personalEmail")}</label>
            <input type="email" value={form.personal_email} onChange={(e) => set("personal_email", e.target.value)} className={canEditField("personal_email") ? inputClass : disabledClass} disabled={!canEditField("personal_email")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.contactNumber")}</label>
            <input type="text" value={form.contact_number} onChange={(e) => set("contact_number", e.target.value)} className={canEditField("contact_number") ? inputClass : disabledClass} disabled={!canEditField("contact_number")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.gender")}</label>
            <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className={canEditField("gender") ? inputClass : disabledClass} disabled={!canEditField("gender")}>
              <option value="">{t("employeeProfile.personal.select.placeholder")}</option>
              <option value="male">{t("employeeProfile.gender.male")}</option>
              <option value="female">{t("employeeProfile.gender.female")}</option>
              <option value="other">{t("employeeProfile.gender.other")}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.dateOfBirth")}</label>
            {/* #1406 — DOB cannot be in the future */}
            <input type="date" max={new Date().toISOString().slice(0, 10)} value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className={canEditField("date_of_birth") ? inputClass : disabledClass} disabled={!canEditField("date_of_birth")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.bloodGroup")}</label>
            <input type="text" value={form.blood_group} onChange={(e) => set("blood_group", e.target.value)} className={canEditField("blood_group") ? inputClass : disabledClass} disabled={!canEditField("blood_group")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.maritalStatus")}</label>
            <select value={form.marital_status} onChange={(e) => set("marital_status", e.target.value)} className={canEditField("marital_status") ? inputClass : disabledClass} disabled={!canEditField("marital_status")}>
              <option value="">{t("employeeProfile.personal.select.placeholder")}</option>
              <option value="single">{t("employeeProfile.maritalStatus.single")}</option>
              <option value="married">{t("employeeProfile.maritalStatus.married")}</option>
              <option value="divorced">{t("employeeProfile.maritalStatus.divorced")}</option>
              <option value="widowed">{t("employeeProfile.maritalStatus.widowed")}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.nationality")}</label>
            <input type="text" value={form.nationality} onChange={(e) => set("nationality", e.target.value)} className={canEditField("nationality") ? inputClass : disabledClass} disabled={!canEditField("nationality")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.aadharNumber")}</label>
            <input
              type="text"
              value={form.aadhar_number}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                set("aadhar_number", digits);
                if (idErrors.aadhar_number) setIdErrors((p) => ({ ...p, aadhar_number: undefined }));
              }}
              onBlur={(e) => setIdErrors((p) => ({ ...p, aadhar_number: validateIdDoc("aadhar_number", e.target.value, t) || undefined }))}
              inputMode="numeric"
              maxLength={12}
              placeholder={t("employeeProfile.personal.aadhar.placeholder")}
              className={`${canEditField("aadhar_number") ? inputClass : disabledClass} ${idErrors.aadhar_number ? "border-red-500 focus:ring-red-500" : ""}`}
              disabled={!canEditField("aadhar_number")}
            />
            {idErrors.aadhar_number && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{idErrors.aadhar_number}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.panNumber")}</label>
            <input
              type="text"
              value={form.pan_number}
              onChange={(e) => {
                set("pan_number", e.target.value.toUpperCase().slice(0, 10));
                if (idErrors.pan_number) setIdErrors((p) => ({ ...p, pan_number: undefined }));
              }}
              onBlur={(e) => setIdErrors((p) => ({ ...p, pan_number: validateIdDoc("pan_number", e.target.value, t) || undefined }))}
              maxLength={10}
              placeholder="ABCDE1234F"
              className={`${canEditField("pan_number") ? inputClass : disabledClass} ${idErrors.pan_number ? "border-red-500 focus:ring-red-500" : ""}`}
              disabled={!canEditField("pan_number")}
            />
            {idErrors.pan_number && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{idErrors.pan_number}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.uanNumber")}</label>
            <input
              type="text"
              value={form.uan_number}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                set("uan_number", digits);
                if (idErrors.uan_number) setIdErrors((p) => ({ ...p, uan_number: undefined }));
              }}
              onBlur={(e) => setIdErrors((p) => ({ ...p, uan_number: validateIdDoc("uan_number", e.target.value, t) || undefined }))}
              inputMode="numeric"
              maxLength={12}
              placeholder={t("employeeProfile.personal.uan.placeholder")}
              className={`${canEditField("uan_number") ? inputClass : disabledClass} ${idErrors.uan_number ? "border-red-500 focus:ring-red-500" : ""}`}
              disabled={!canEditField("uan_number")}
            />
            {idErrors.uan_number && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{idErrors.uan_number}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.passportNumber")}</label>
            <input
              type="text"
              value={form.passport_number}
              onChange={(e) => {
                set("passport_number", e.target.value.toUpperCase().slice(0, 8));
                if (idErrors.passport_number) setIdErrors((p) => ({ ...p, passport_number: undefined }));
              }}
              onBlur={(e) => setIdErrors((p) => ({ ...p, passport_number: validateIdDoc("passport_number", e.target.value, t) || undefined }))}
              maxLength={8}
              placeholder="A1234567"
              className={`${canEditField("passport_number") ? inputClass : disabledClass} ${idErrors.passport_number ? "border-red-500 focus:ring-red-500" : ""}`}
              disabled={!canEditField("passport_number")}
            />
            {idErrors.passport_number && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{idErrors.passport_number}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.passportExpiry")}</label>
            <input type="date" value={form.passport_expiry} onChange={(e) => set("passport_expiry", e.target.value)} className={canEditField("passport_expiry") ? inputClass : disabledClass} disabled={!canEditField("passport_expiry")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.visaStatus")}</label>
            <input type="text" value={form.visa_status} onChange={(e) => set("visa_status", e.target.value)} className={canEditField("visa_status") ? inputClass : disabledClass} disabled={!canEditField("visa_status")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.visaExpiry")}</label>
            <input type="date" value={form.visa_expiry} onChange={(e) => set("visa_expiry", e.target.value)} className={canEditField("visa_expiry") ? inputClass : disabledClass} disabled={!canEditField("visa_expiry")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.emergencyContact")}</label>
            <input type="text" value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} className={canEditField("emergency_contact_name") ? inputClass : disabledClass} disabled={!canEditField("emergency_contact_name")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.emergencyPhone")}</label>
            <input type="text" value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} className={canEditField("emergency_contact_phone") ? inputClass : disabledClass} disabled={!canEditField("emergency_contact_phone")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.emergencyRelation")}</label>
            <input type="text" value={form.emergency_contact_relation} onChange={(e) => set("emergency_contact_relation", e.target.value)} className={canEditField("emergency_contact_relation") ? inputClass : disabledClass} disabled={!canEditField("emergency_contact_relation")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.noticePeriodDays")}</label>
            <input type="number" value={form.notice_period_days} onChange={(e) => set("notice_period_days", e.target.value)} className={canEditField("notice_period_days") ? inputClass : disabledClass} disabled={!canEditField("notice_period_days")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.reportingManager")}</label>
            <select value={form.reporting_manager_id} onChange={(e) => set("reporting_manager_id", e.target.value)} className={canEditField("reporting_manager_id") ? inputClass : disabledClass} disabled={!canEditField("reporting_manager_id")}>
              <option value="">{t("employeeProfile.personal.reportingManager.none")}</option>
              {(allUsers || [])
                .filter((u: any) => u.id !== userId && ["manager", "hr_admin", "org_admin", "super_admin"].includes(u.role))
                .map((u: any) => (
                  <option key={u.id} value={u.id}>{t("employeeProfile.personal.reportingManager.option", { name: `${u.first_name} ${u.last_name}`, role: u.role.replace("_", " "), email: u.email })}</option>
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
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.department")}</label>
            <select value={form.department_id} onChange={(e) => set("department_id", e.target.value)} className={!selfService ? inputClass : disabledClass} disabled={selfService}>
              <option value="">{t("employeeProfile.personal.department.none")}</option>
              {(departments || []).map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {/* #1423 — Shift (HR-only). Sent as shift_id; the server creates a
              user_shift_assignments row starting today when this changes. */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.shift")}</label>
            <select value={form.shift_id} onChange={(e) => set("shift_id", e.target.value)} className={!selfService ? inputClass : disabledClass} disabled={selfService}>
              <option value="">{t("employeeProfile.personal.shift.none")}</option>
              {(shifts || []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {/* #1424 — Designation. HR can edit; employees see it read-only. */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.designation")}</label>
            <input
              type="text"
              value={form.designation}
              onChange={(e) => set("designation", e.target.value)}
              className={!selfService ? inputClass : disabledClass}
              disabled={selfService}
              placeholder={selfService ? t("employeeProfile.personal.designation.placeholderSelfService") : t("employeeProfile.personal.designation.placeholderHint")}
            />
          </div>
          {/* emp-payroll#246 — Employee Code. HR-editable; employees see it
              read-only. Used downstream by emp-payroll for the My Profile
              header and the salary slip. */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t("employeeProfile.personal.field.employeeCode")}</label>
            <input
              type="text"
              value={form.emp_code}
              onChange={(e) => set("emp_code", e.target.value)}
              className={!selfService ? inputClass : disabledClass}
              disabled={selfService}
              maxLength={50}
              placeholder={selfService ? t("employeeProfile.personal.empCode.placeholderSelfService") : t("employeeProfile.personal.empCode.placeholderHint")}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => {
              const errs = {
                pan_number: validateIdDoc("pan_number", form.pan_number || "", t) || undefined,
                aadhar_number: validateIdDoc("aadhar_number", form.aadhar_number || "", t) || undefined,
                uan_number: validateIdDoc("uan_number", form.uan_number || "", t) || undefined,
                passport_number: validateIdDoc("passport_number", form.passport_number || "", t) || undefined,
              };
              if (errs.pan_number || errs.aadhar_number || errs.uan_number || errs.passport_number) {
                setIdErrors(errs);
                return;
              }
              onSave?.(Object.fromEntries(Object.entries(form).filter(([k]) => canEditField(k)).map(([k, v]) => [k, v || null])));
            }}
            disabled={saving}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            <Check className="h-4 w-4" /> {saving ? t("employeeProfile.personal.saving") : t("employeeProfile.personal.saveChanges")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <dl>
      <FieldRow label={t("employeeProfile.personal.field.personalEmail")} value={profile.personal_email} />
      <FieldRow label={t("employeeProfile.personal.field.contactNumber")} value={profile.contact_number} />
      <FieldRow label={t("employeeProfile.personal.field.gender")} value={profile.gender ? t(`employeeProfile.gender.${profile.gender}`, { defaultValue: profile.gender }) : null} />
      <FieldRow
        label={t("employeeProfile.personal.field.dateOfBirth")}
        value={profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString() : null}
      />
      <FieldRow label={t("employeeProfile.personal.field.bloodGroup")} value={profile.blood_group} />
      <FieldRow label={t("employeeProfile.personal.field.maritalStatus")} value={profile.marital_status ? t(`employeeProfile.maritalStatus.${profile.marital_status}`, { defaultValue: profile.marital_status }) : null} />
      <FieldRow label={t("employeeProfile.personal.field.nationality")} value={profile.nationality} />
      <FieldRow label={t("employeeProfile.personal.field.aadharNumber")} value={profile.aadhar_number} />
      <FieldRow label={t("employeeProfile.personal.field.panNumber")} value={profile.pan_number} />
      <FieldRow label={t("employeeProfile.personal.field.uanNumber")} value={profile.uan_number} />
      <FieldRow label={t("employeeProfile.personal.field.passportNumber")} value={profile.passport_number} />
      <FieldRow
        label={t("employeeProfile.personal.field.passportExpiry")}
        value={profile.passport_expiry ? new Date(profile.passport_expiry).toLocaleDateString() : null}
      />
      <FieldRow label={t("employeeProfile.personal.field.visaStatus")} value={profile.visa_status} />
      <FieldRow
        label={t("employeeProfile.personal.field.visaExpiry")}
        value={profile.visa_expiry ? new Date(profile.visa_expiry).toLocaleDateString() : null}
      />
      <FieldRow label={t("employeeProfile.personal.field.emergencyContact")} value={profile.emergency_contact_name} />
      <FieldRow label={t("employeeProfile.personal.field.emergencyPhone")} value={profile.emergency_contact_phone} />
      <FieldRow label={t("employeeProfile.personal.field.emergencyRelation")} value={profile.emergency_contact_relation} />
      <FieldRow
        label={t("employeeProfile.personal.field.probationStart")}
        value={profile.probation_start_date ? new Date(profile.probation_start_date).toLocaleDateString() : null}
      />
      <FieldRow
        label={t("employeeProfile.personal.field.probationEnd")}
        value={profile.probation_end_date ? new Date(profile.probation_end_date).toLocaleDateString() : null}
      />
      <FieldRow
        label={t("employeeProfile.personal.field.confirmationDate")}
        value={profile.confirmation_date ? new Date(profile.confirmation_date).toLocaleDateString() : null}
      />
      <FieldRow label={t("employeeProfile.personal.field.noticePeriodDays")} value={profile.notice_period_days} />
      <FieldRow label={t("employeeProfile.personal.field.reportingManager")} value={profile.reporting_manager_name || (profile.reporting_manager_id ? t("employeeProfile.personal.reportingManagerFallback", { id: profile.reporting_manager_id }) : null)} />
      <AdditionalManagersReadRow userId={profile.id} />
      <CustomRolesReadRow userId={profile.id} />
      {/* #1423 / #1424 — surface designation, department and current shift in
          the read-only view so self-service employees can see them even if
          they can't edit them. */}
      <FieldRow label={t("employeeProfile.personal.field.designation")} value={profile.designation} />
      <FieldRow label={t("employeeProfile.personal.field.employeeCode")} value={profile.emp_code} />
      <FieldRow label={t("employeeProfile.personal.field.department")} value={profile.department_name || (profile.department_id ? t("employeeProfile.personal.departmentFallback", { id: profile.department_id }) : null)} />
      <FieldRow label={t("employeeProfile.personal.field.shift")} value={profile.shift_name || (profile.shift_id ? t("employeeProfile.personal.shiftFallback", { id: profile.shift_id }) : null)} />
    </dl>
  );
}

// Read-only chip list of the user's assigned custom roles. Renders nothing
// when there are no custom roles so the summary stays compact.
function CustomRolesReadRow({ userId }: { userId?: number }) {
  const { t } = useTranslation();
  // Only viewers with roles:view / roles:manage can read a user's custom-role
  // assignments. Without this gate the query fired for every profile viewer
  // (e.g. an employee on their own profile) and 403'd on /roles/users/:id.
  const { has } = usePermissions();
  const canReadRoles = has("roles:view", "roles:manage");
  const { data = [] } = useQuery<any[]>({
    queryKey: ["user-custom-roles", userId],
    queryFn: () =>
      api.get(`/roles/users/${userId}`).then((r) => r.data?.data ?? []),
    enabled: !!userId && canReadRoles,
  });
  if (!Array.isArray(data) || data.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-x-4 py-2 border-b border-border">
      <dt className="text-sm font-medium text-muted-foreground col-span-1">{t("employeeProfile.customRoles.label")}</dt>
      <dd className="text-sm text-foreground col-span-2 flex flex-wrap gap-1.5">
        {data.map((r: any) => (
          <span
            key={r.id}
            title={r.description || undefined}
            className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-900 text-xs text-brand-700 dark:text-brand-300"
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
  const { t } = useTranslation();
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
    <div className="grid grid-cols-3 gap-x-4 py-2 border-b border-border">
      <dt className="text-sm font-medium text-muted-foreground col-span-1">{t("employeeProfile.additionalManagers.label")}</dt>
      <dd className="text-sm text-foreground col-span-2 flex flex-wrap gap-1.5">
        {managers.map((u) => (
          <span
            key={u.id}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
          >
            <span className="h-5 w-5 rounded-full bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 flex items-center justify-center text-[10px] font-semibold">
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
  "w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500";

function SubResourceError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm rounded-lg px-3 py-2 mb-3">
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
  const { t } = useTranslation();
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
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          {t("employeeProfile.additionalManagers.label")}
        </label>
        <div className="min-h-[40px] flex flex-wrap items-center gap-1.5 border border-border rounded-md bg-muted px-2 py-2">
          {isLoading ? (
            <span className="text-sm text-muted-foreground">{t("employeeProfile.additionalManagers.loading")}</span>
          ) : selected.length === 0 ? (
            <span className="text-sm text-muted-foreground">{t("employeeProfile.additionalManagers.empty")}</span>
          ) : (
            selected.map((id) => {
              const u = usersById.get(id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-card border border-border text-xs text-muted-foreground"
                >
                  <span className="h-5 w-5 rounded-full bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 flex items-center justify-center text-[10px] font-semibold">
                    {(u?.first_name?.[0] || "?")}{(u?.last_name?.[0] || "")}
                  </span>
                  <span className="truncate max-w-[160px]">
                    {u ? `${u.first_name} ${u.last_name}` : t("employeeProfile.additionalManagers.userFallback", { id })}
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
      <label className="block text-sm font-medium text-muted-foreground mb-1">
        {t("employeeProfile.additionalManagers.label")}
        {selected.length > 0 && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {t("employeeProfile.additionalManagers.selectedCount", { count: selected.length })}
          </span>
        )}
      </label>
      <p className="text-xs text-muted-foreground mb-2">
        {t("employeeProfile.additionalManagers.description")}
      </p>

      {/* Selected-chips + search input wrapper */}
      <div
        className="relative min-h-[42px] border border-border rounded-md bg-card px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500"
        onClick={() => setOpen(true)}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((id) => {
            const u = usersById.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-900 text-xs text-brand-700 dark:text-brand-300"
              >
                <span className="h-5 w-5 rounded-full bg-brand-200 dark:bg-brand-900 text-brand-800 dark:text-brand-200 flex items-center justify-center text-[10px] font-semibold">
                  {(u?.first_name?.[0] || "?")}{(u?.last_name?.[0] || "")}
                </span>
                <span className="truncate max-w-[160px]">
                  {u ? `${u.first_name} ${u.last_name}` : t("employeeProfile.additionalManagers.userFallback", { id })}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); remove(id); }}
                  className="ml-0.5 h-4 w-4 flex items-center justify-center rounded-full hover:bg-brand-200 dark:hover:bg-brand-800"
                  aria-label={t("employeeProfile.additionalManagers.removeAria", { name: u ? `${u.first_name} ${u.last_name}` : t("employeeProfile.additionalManagers.removeAriaFallback") })}
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
            placeholder={selected.length === 0 ? t("employeeProfile.additionalManagers.searchPlaceholderEmpty") : t("employeeProfile.additionalManagers.searchPlaceholderMore")}
            className="flex-1 min-w-[140px] outline-none text-sm py-0.5 bg-transparent"
          />
        </div>

        {/* Dropdown */}
        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {query ? t("employeeProfile.additionalManagers.noMatches") : t("employeeProfile.additionalManagers.allSelected")}
              </div>
            ) : (
              filtered.map((u: any) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => add(u.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-brand-50 dark:hover:bg-brand-950/40 text-left"
                >
                  <span className="h-7 w-7 rounded-full bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {(u.first_name?.[0] || "?")}{(u.last_name?.[0] || "")}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-foreground truncate">
                      {u.first_name} {u.last_name}
                      {u.role && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          · {u.role.replace("_", " ")}
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">{u.email}</span>
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
          {mutation.isPending ? t("employeeProfile.additionalManagers.saving") : t("employeeProfile.additionalManagers.save")}
        </button>
        {dirty && !mutation.isPending && (
          <span className="text-xs text-amber-600 dark:text-amber-400">{t("employeeProfile.additionalManagers.unsaved")}</span>
        )}
        {mutation.isSuccess && !dirty && (
          <span className="text-xs text-green-600 dark:text-green-400">{t("employeeProfile.additionalManagers.saved")}</span>
        )}
        {mutation.isError && (
          <span className="text-xs text-red-600 dark:text-red-400">{extractApiError(mutation.error, t)}</span>
        )}
      </div>
    </div>
  );
}


function extractApiError(err: any, t: (key: string) => string): string {
  const resp = err?.response?.data?.error;
  const details: any[] = Array.isArray(resp?.details) ? resp.details : [];
  if (details.length > 0) {
    return details
      .map((d) => (d?.path?.length ? `${d.path.join(".")}: ${d?.message || ""}` : d?.message || ""))
      .filter(Boolean)
      .join("; ");
  }
  return resp?.message || err?.message || t("employeeProfile.apiError.requestFailed");
}

// ---------------------------------------------------------------------------
// Education Tab
// ---------------------------------------------------------------------------

function EducationTab({ data, userId, canEdit }: { data?: any[]; userId: number; canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  // Confirm-delete dialog state (replaces window.confirm). Holds the record id.
  const [deleteId, setDeleteId] = useState<number | null>(null);
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
    onError: (err: any) => setError(extractApiError(err, t)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      api.put(`/employees/${userId}/education/${id}`, payload),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: any) => setError(extractApiError(err, t)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/employees/${userId}/education/${id}`),
    onSuccess: () => { invalidate(); setDeleteId(null); },
    onError: (err: any) => setError(extractApiError(err, t)),
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
      setError(t("employeeProfile.education.validation.required"));
      return;
    }
    // #1405 — end year must not be before start year
    if (
      payload.start_year != null &&
      payload.end_year != null &&
      payload.end_year < payload.start_year
    ) {
      setError(t("employeeProfile.education.validation.endYear"));
      return;
    }
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  function handleDelete(id: number) {
    setDeleteId(id);
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
            <Plus className="h-4 w-4" /> {t("employeeProfile.education.add")}
          </button>
        </div>
      )}

      {showForm && (
        <div className="border border-border rounded-lg p-4 mb-4 bg-muted">
          <h4 className="text-sm font-semibold text-muted-foreground mb-3">
            {editingId ? t("employeeProfile.education.editHeading") : t("employeeProfile.education.add")}
          </h4>
          <SubResourceError error={error} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.education.field.degree")}</label>
              <input
                value={form.degree || ""}
                onChange={(e) => setForm({ ...form, degree: e.target.value })}
                className={subInputClass}
                placeholder={t("employeeProfile.education.degree.placeholder")}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.education.field.institution")}</label>
              <input
                value={form.institution || ""}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
                className={subInputClass}
                placeholder={t("employeeProfile.education.institution.placeholder")}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.education.field.fieldOfStudy")}</label>
              <input
                value={form.field_of_study || ""}
                onChange={(e) => setForm({ ...form, field_of_study: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.education.field.grade")}</label>
              <input
                value={form.grade || ""}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.education.field.startYear")}</label>
              <input
                type="number"
                value={form.start_year || ""}
                onChange={(e) => setForm({ ...form, start_year: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.education.field.endYear")}</label>
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
              <Check className="h-3.5 w-3.5" /> {saving ? t("employeeProfile.common.saving") : t("employeeProfile.common.save")}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5"
            >
              <X className="h-3.5 w-3.5" /> {t("employeeProfile.common.cancel")}
            </button>
          </div>
        </div>
      )}

      {!data || data.length === 0 ? (
        !showForm && (
          <div className="flex flex-col items-center justify-center text-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <GraduationCap className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">{t("employeeProfile.education.empty")}</p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {data.map((edu: any) => (
            <div key={edu.id} className="border border-border rounded-lg p-4 flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">{edu.degree}</h3>
                <p className="text-sm text-muted-foreground">{edu.institution}</p>
                {edu.field_of_study && (
                  <p className="text-sm text-muted-foreground">{edu.field_of_study}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {edu.start_year && edu.end_year
                    ? t("employeeProfile.education.yearRange", { start: edu.start_year, end: edu.end_year })
                    : edu.start_year
                    ? t("employeeProfile.education.fromYear", { year: edu.start_year })
                    : ""}
                  {edu.grade ? t("employeeProfile.education.gradeSuffix", { grade: edu.grade }) : ""}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => startEdit(edu)}
                    className="p-1.5 text-muted-foreground hover:text-brand-600 dark:hover:text-brand-400 rounded hover:bg-muted"
                    title={t("employeeProfile.common.edit")}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(edu.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-muted"
                    title={t("employeeProfile.common.delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title={t("employeeProfile.education.deleteDialog.title")}
        confirmText={t("employeeProfile.common.delete")}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteId !== null && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Experience Tab
// ---------------------------------------------------------------------------

function ExperienceTab({ data, userId, canEdit }: { data?: any[]; userId: number; canEdit: boolean }) {
  const { t } = useTranslation();
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
  // Confirm-delete dialog state (replaces window.confirm). Holds the record id.
  const [deleteId, setDeleteId] = useState<number | null>(null);

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
    onError: (err: any) => setError(extractApiError(err, t)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      api.put(`/employees/${userId}/experience/${id}`, payload),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: any) => setError(extractApiError(err, t)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/employees/${userId}/experience/${id}`),
    onSuccess: () => { invalidate(); setDeleteId(null); },
    onError: (err: any) => setError(extractApiError(err, t)),
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
      setError(t("employeeProfile.experience.validation.required"));
      return;
    }
    const payload = buildPayload();
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  function handleDelete(id: number) {
    setDeleteId(id);
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
            <Plus className="h-4 w-4" /> {t("employeeProfile.experience.add")}
          </button>
        </div>
      )}

      {showForm && (
        <div className="border border-border rounded-lg p-4 mb-4 bg-muted">
          <h4 className="text-sm font-semibold text-muted-foreground mb-3">
            {editingId ? t("employeeProfile.experience.editHeading") : t("employeeProfile.experience.add")}
          </h4>
          <SubResourceError error={error} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.experience.field.company")}</label>
              <input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.experience.field.designation")}</label>
              <input
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.experience.field.startDate")}</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.experience.field.endDate")}</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                disabled={form.is_current}
                className={form.is_current ? `${subInputClass} bg-muted cursor-not-allowed` : subInputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.is_current}
                  onChange={(e) => setForm({ ...form, is_current: e.target.checked })}
                  className="rounded border-border text-brand-600 dark:text-brand-400"
                />
                {t("employeeProfile.experience.currentlyWorking")}
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.experience.field.description")}</label>
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
              <Check className="h-3.5 w-3.5" /> {saving ? t("employeeProfile.common.saving") : t("employeeProfile.common.save")}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5"
            >
              <X className="h-3.5 w-3.5" /> {t("employeeProfile.common.cancel")}
            </button>
          </div>
        </div>
      )}

      {!data || data.length === 0 ? (
        !showForm && (
          <div className="flex flex-col items-center justify-center text-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Briefcase className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">{t("employeeProfile.experience.empty")}</p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {data.map((exp: any) => (
            <div key={exp.id} className="border border-border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{exp.designation}</h3>
                    {exp.is_current && (
                      <span className="text-xs bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-md font-medium">
                        {t("employeeProfile.experience.currentBadge")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{exp.company_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {exp.start_date ? new Date(exp.start_date).toLocaleDateString() : ""} -{" "}
                    {exp.is_current
                      ? t("employeeProfile.experience.present")
                      : exp.end_date
                      ? new Date(exp.end_date).toLocaleDateString()
                      : ""}
                  </p>
                  {exp.description && (
                    <p className="text-sm text-muted-foreground mt-2">{exp.description}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 ml-3">
                    <button
                      onClick={() => startEdit(exp)}
                      className="p-1.5 text-muted-foreground hover:text-brand-600 dark:hover:text-brand-400 rounded hover:bg-muted"
                      title={t("employeeProfile.common.edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(exp.id)}
                      className="p-1.5 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-muted"
                      title={t("employeeProfile.common.delete")}
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

      <ConfirmDialog
        open={deleteId !== null}
        title={t("employeeProfile.experience.deleteDialog.title")}
        confirmText={t("employeeProfile.common.delete")}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteId !== null && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dependents Tab
// ---------------------------------------------------------------------------

function DependentsTab({ data, userId, canEdit }: { data?: any[]; userId: number; canEdit: boolean }) {
  const { t } = useTranslation();
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
  // Confirm-delete dialog state (replaces window.confirm). Holds the record id.
  const [deleteId, setDeleteId] = useState<number | null>(null);

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
    onError: (err: any) => setError(extractApiError(err, t)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      api.put(`/employees/${userId}/dependents/${id}`, payload),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: any) => setError(extractApiError(err, t)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/employees/${userId}/dependents/${id}`),
    onSuccess: () => { invalidate(); setDeleteId(null); },
    onError: (err: any) => setError(extractApiError(err, t)),
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
      setError(t("employeeProfile.dependents.validation.required"));
      return;
    }
    const payload = buildPayload();
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  function handleDelete(id: number) {
    setDeleteId(id);
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
            <Plus className="h-4 w-4" /> {t("employeeProfile.dependents.add")}
          </button>
        </div>
      )}

      {showForm && (
        <div className="border border-border rounded-lg p-4 mb-4 bg-muted">
          <h4 className="text-sm font-semibold text-muted-foreground mb-3">
            {editingId ? t("employeeProfile.dependents.editHeading") : t("employeeProfile.dependents.add")}
          </h4>
          <SubResourceError error={error} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.dependents.field.name")}</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.dependents.field.relationship")}</label>
              <input
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                placeholder={t("employeeProfile.dependents.relationship.placeholder")}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.dependents.field.dateOfBirth")}</label>
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
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.dependents.field.gender")}</label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                className={subInputClass}
              >
                <option value="">{t("employeeProfile.personal.select.placeholder")}</option>
                <option value="male">{t("employeeProfile.gender.male")}</option>
                <option value="female">{t("employeeProfile.gender.female")}</option>
                <option value="other">{t("employeeProfile.gender.other")}</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground mt-6">
                <input
                  type="checkbox"
                  checked={form.is_nominee}
                  onChange={(e) => setForm({ ...form, is_nominee: e.target.checked })}
                  className="rounded border-border text-brand-600 dark:text-brand-400"
                />
                {t("employeeProfile.dependents.isNominee")}
              </label>
            </div>
            {form.is_nominee && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.dependents.field.nomineePercent")}</label>
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
              <Check className="h-3.5 w-3.5" /> {saving ? t("employeeProfile.common.saving") : t("employeeProfile.common.save")}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5"
            >
              <X className="h-3.5 w-3.5" /> {t("employeeProfile.common.cancel")}
            </button>
          </div>
        </div>
      )}

      {!data || data.length === 0 ? (
        !showForm && (
          <div className="flex flex-col items-center justify-center text-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Users className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">{t("employeeProfile.dependents.empty")}</p>
          </div>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2">{t("employeeProfile.dependents.column.name")}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2">{t("employeeProfile.dependents.column.relationship")}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2">{t("employeeProfile.dependents.column.dob")}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2">{t("employeeProfile.dependents.column.gender")}</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-2">{t("employeeProfile.dependents.column.nominee")}</th>
                {canEdit && <th className="text-right text-xs font-medium text-muted-foreground uppercase px-4 py-2">{t("employeeProfile.dependents.column.actions")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((dep: any) => (
                <tr key={dep.id}>
                  <td className="px-4 py-3 text-sm text-foreground">{dep.name}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{dep.relationship}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {dep.date_of_birth ? new Date(dep.date_of_birth).toLocaleDateString() : t("employeeProfile.field.emptyValue")}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground capitalize">{dep.gender ? t(`employeeProfile.gender.${dep.gender}`, { defaultValue: dep.gender }) : t("employeeProfile.field.emptyValue")}</td>
                  <td className="px-4 py-3 text-sm">
                    {dep.is_nominee ? (
                      <span className="text-green-700 dark:text-green-300 font-medium">
                        {dep.nominee_percentage
                          ? t("employeeProfile.dependents.nomineeYesPercent", { percent: dep.nominee_percentage })
                          : t("employeeProfile.dependents.nomineeYes")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("employeeProfile.dependents.nomineeNo")}</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(dep)}
                          className="p-1.5 text-muted-foreground hover:text-brand-600 dark:hover:text-brand-400 rounded hover:bg-muted"
                          title={t("employeeProfile.common.edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(dep.id)}
                          className="p-1.5 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-muted"
                          title={t("employeeProfile.common.delete")}
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

      <ConfirmDialog
        open={deleteId !== null}
        title={t("employeeProfile.dependents.deleteDialog.title")}
        confirmText={t("employeeProfile.common.delete")}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteId !== null && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Addresses Tab
// ---------------------------------------------------------------------------

function AddressesTab({ data, userId, canEdit }: { data?: any[]; userId: number; canEdit: boolean }) {
  const { t } = useTranslation();
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
  // Confirm-delete dialog state (replaces window.confirm). Holds the record id.
  const [deleteId, setDeleteId] = useState<number | null>(null);

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
    onError: (err: any) => setError(extractApiError(err, t)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      api.put(`/employees/${userId}/addresses/${id}`, payload),
    onSuccess: () => { invalidate(); resetForm(); },
    onError: (err: any) => setError(extractApiError(err, t)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/employees/${userId}/addresses/${id}`),
    onSuccess: () => { invalidate(); setDeleteId(null); },
    onError: (err: any) => setError(extractApiError(err, t)),
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
      setError(t("employeeProfile.addresses.validation.required"));
      return;
    }
    const payload = buildPayload();
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  function handleDelete(id: number) {
    setDeleteId(id);
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
            <Plus className="h-4 w-4" /> {t("employeeProfile.addresses.add")}
          </button>
        </div>
      )}

      {showForm && (
        <div className="border border-border rounded-lg p-4 mb-4 bg-muted">
          <h4 className="text-sm font-semibold text-muted-foreground mb-3">
            {editingId ? t("employeeProfile.addresses.editHeading") : t("employeeProfile.addresses.add")}
          </h4>
          <SubResourceError error={error} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.addresses.field.type")}</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={subInputClass}
              >
                <option value="current">{t("employeeProfile.addresses.type.current")}</option>
                <option value="permanent">{t("employeeProfile.addresses.type.permanent")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.addresses.field.country")}</label>
              <input
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.addresses.field.line1")}</label>
              <input
                value={form.line1}
                onChange={(e) => setForm({ ...form, line1: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.addresses.field.line2")}</label>
              <input
                value={form.line2}
                onChange={(e) => setForm({ ...form, line2: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.addresses.field.city")}</label>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.addresses.field.state")}</label>
              <input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className={subInputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("employeeProfile.addresses.field.zipcode")}</label>
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
              <Check className="h-3.5 w-3.5" /> {saving ? t("employeeProfile.common.saving") : t("employeeProfile.common.save")}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5"
            >
              <X className="h-3.5 w-3.5" /> {t("employeeProfile.common.cancel")}
            </button>
          </div>
        </div>
      )}

      {!data || data.length === 0 ? (
        !showForm && (
          <div className="flex flex-col items-center justify-center text-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <MapPin className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">{t("employeeProfile.addresses.empty")}</p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {data.map((addr: any) => (
            <div key={addr.id} className="border border-border rounded-lg p-4 flex items-start justify-between">
              <div className="flex-1">
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md font-medium uppercase mb-2 inline-block">
                  {t(`employeeProfile.addresses.type.${addr.type}`, { defaultValue: addr.type })}
                </span>
                <p className="text-sm text-foreground">{addr.line1}</p>
                {addr.line2 && <p className="text-sm text-muted-foreground">{addr.line2}</p>}
                <p className="text-sm text-muted-foreground">
                  {addr.city}, {addr.state} {addr.zipcode}
                </p>
                <p className="text-sm text-muted-foreground">{addr.country}</p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => startEdit(addr)}
                    className="p-1.5 text-muted-foreground hover:text-brand-600 dark:hover:text-brand-400 rounded hover:bg-muted"
                    title={t("employeeProfile.common.edit")}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(addr.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-muted"
                    title={t("employeeProfile.common.delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title={t("employeeProfile.addresses.deleteDialog.title")}
        confirmText={t("employeeProfile.common.delete")}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteId !== null && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
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
  const { t } = useTranslation();
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
      setError(err.response?.data?.error?.message || t("employeeProfile.custom.saveError"));
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
    return <p className="text-sm text-muted-foreground">{t("employeeProfile.custom.loading")}</p>;
  }

  if (definitions.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">
          {t("employeeProfile.custom.emptyTitle")}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {t("employeeProfile.custom.emptyHint")}
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
        <h3 className="text-sm font-semibold text-muted-foreground">{t("employeeProfile.custom.heading")}</h3>
        {!editing ? (
          <button
            onClick={startEditing}
            className="flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("employeeProfile.custom.edit")}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {t("employeeProfile.custom.save")}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5"
            >
              <X className="h-3.5 w-3.5" />
              {t("employeeProfile.custom.cancel")}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {Object.entries(sections).map(([sectionName, sectionDefs]) => (
        <div key={sectionName} className="mb-6 last:mb-0">
          {Object.keys(sections).length > 1 && (
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
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
  const { t } = useTranslation();
  let displayValue: string = t("employeeProfile.field.emptyValue");

  if (value !== null && value !== undefined && value !== "") {
    if (def.field_type === "checkbox") {
      displayValue = value ? t("employeeProfile.custom.checkboxYes") : t("employeeProfile.custom.checkboxNo");
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
    <div className="grid grid-cols-3 py-3 border-b border-border last:border-0">
      <dt className="text-sm font-medium text-muted-foreground">
        {def.field_name}
        {def.is_required && <span className="text-red-400 ml-0.5">*</span>}
      </dt>
      <dd className="col-span-2 text-sm text-foreground">{displayValue}</dd>
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
  const { t } = useTranslation();
  const inputClass =
    "w-full border border-border rounded-lg px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500";

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
          <option value="">{t("employeeProfile.custom.select.placeholder")}</option>
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
            <label key={opt} className="flex items-center gap-2 text-sm text-muted-foreground">
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
                className="rounded border-border text-brand-600 dark:text-brand-400 focus:ring-brand-500"
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
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-border text-brand-600 dark:text-brand-400 focus:ring-brand-500"
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
          placeholder={def.placeholder || t("employeeProfile.custom.file.placeholder")}
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
    <div className="grid grid-cols-3 py-3 border-b border-border last:border-0 items-start">
      <dt className="text-sm font-medium text-muted-foreground pt-2">
        {def.field_name}
        {def.is_required && <span className="text-red-400 ml-0.5">*</span>}
        {def.help_text && (
          <p className="text-xs text-muted-foreground font-normal mt-0.5">{def.help_text}</p>
        )}
      </dt>
      <dd className="col-span-2">{input}</dd>
    </div>
  );
}
