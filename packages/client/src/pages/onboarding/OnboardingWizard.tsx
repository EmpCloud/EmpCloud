import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Users,
  Mail,
  Package,
  Settings,
  Check,
  ChevronRight,
  ChevronLeft,
  Plus,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";
import api from "@/api/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepStatus {
  step: number;
  name: string;
  key: string;
  completed: boolean;
}

interface OnboardingStatus {
  completed: boolean;
  currentStep: number;
  steps: StepStatus[];
}

// ---------------------------------------------------------------------------
// Step Icons
// ---------------------------------------------------------------------------

const STEP_ICONS = [Building2, Users, Mail, Package, Settings];

const STEP_DESCRIPTIONS = [
  "Tell us about your company",
  "Set up your departments",
  "Invite your team members",
  "Choose the modules you need",
  "Configure basic policies",
];

// ---------------------------------------------------------------------------
// Timezone options
// ---------------------------------------------------------------------------

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
  { value: "ar", label: "Arabic" },
];

const DEFAULT_DEPARTMENTS = [
  "Engineering",
  "Design",
  "Product",
  "Marketing",
  "Sales",
  "Finance",
  "HR",
  "Operations",
];

const DEFAULT_LEAVE_TYPES = [
  { name: "Earned Leave", code: "EL", annual_quota: 12, is_paid: true, is_carry_forward: true, max_carry_forward_days: 5, description: "Earned/privilege leave" },
  { name: "Casual Leave", code: "CL", annual_quota: 7, is_paid: true, is_carry_forward: false, description: "Casual leave for personal matters" },
  { name: "Sick Leave", code: "SL", annual_quota: 7, is_paid: true, is_carry_forward: false, description: "Medical/sick leave" },
];

// ---------------------------------------------------------------------------
// Main Wizard Component
// ---------------------------------------------------------------------------

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [activeStep, setActiveStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [animating, setAnimating] = useState(false);

  // Step 1 state
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState("IN");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [language, setLanguage] = useState("en");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  // Step 2 state
  const [departments, setDepartments] = useState<string[]>([...DEFAULT_DEPARTMENTS]);
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set(["Engineering", "HR", "Finance"]));
  const [customDept, setCustomDept] = useState("");

  // Step 3 state
  const [invitations, setInvitations] = useState<Array<{ email: string; role: string }>>([
    { email: "", role: "employee" },
  ]);

  // Step 4 state
  const [modules, setModules] = useState<Array<{ id: number; name: string; slug: string; description: string; icon: string; selected: boolean }>>([]);

  // Step 5 state
  const [leaveTypes, setLeaveTypes] = useState(DEFAULT_LEAVE_TYPES.map((lt) => ({ ...lt, enabled: true })));
  const [shiftName, setShiftName] = useState("General Shift");
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("18:00");
  const [workDays] = useState("Mon-Fri");

  // Fetch initial status
  useEffect(() => {
    async function fetchStatus() {
      try {
        const { data } = await api.get("/onboarding/status");
        const s = data.data as OnboardingStatus;
        setStatus(s);

        if (s.completed) {
          navigate("/", { replace: true });
          return;
        }

        // Resume from where they left off
        if (s.currentStep > 0 && s.currentStep < 5) {
          setActiveStep(s.currentStep + 1);
        }
      } catch {
        // If onboarding endpoint fails, redirect to dashboard
        navigate("/", { replace: true });
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
  }, [navigate]);

  // Fetch org info to pre-fill step 1
  useEffect(() => {
    async function fetchOrg() {
      try {
        const { data } = await api.get("/organizations/me");
        const org = data.data;
        if (org.name) setCompanyName(org.name);
        if (org.country) setCountry(org.country);
        if (org.state) setState(org.state || "");
        if (org.city) setCity(org.city || "");
        if (org.timezone) setTimezone(org.timezone);
        if (org.language) setLanguage(org.language);
      } catch {
        // ignore
      }
    }
    fetchOrg();
  }, []);

  // Fetch modules for step 4
  useEffect(() => {
    async function fetchModules() {
      try {
        const { data } = await api.get("/modules");
        const mods = (data.data || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          slug: m.slug,
          description: m.description || "",
          icon: m.icon || "",
          selected: false,
        }));
        setModules(mods);
      } catch {
        // ignore
      }
    }
    fetchModules();
  }, []);

  const animateTransition = useCallback((dir: "left" | "right", newStep: number) => {
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setActiveStep(newStep);
      setAnimating(false);
    }, 200);
  }, []);

  // Step handlers
  const handleNext = async () => {
    setSubmitting(true);
    try {
      let stepData: Record<string, any> = {};

      switch (activeStep) {
        case 1:
          // Upload the logo first if the user picked one, so we can include
          // the resulting server path in the step 1 payload. Upload failure
          // is non-blocking — we surface it as an error message but still
          // advance the step so the rest of the onboarding isn't held up.
          if (logoFile) {
            try {
              const form = new FormData();
              form.append("logo", logoFile);
              await api.post("/organizations/me/logo", form, {
                headers: { "Content-Type": "multipart/form-data" },
              });
              setLogoError(null);
            } catch (err: any) {
              const msg =
                err?.response?.data?.error?.message ||
                err?.message ||
                "Logo upload failed";
              setLogoError(msg);
            }
          }
          stepData = { name: companyName, country, state, city, timezone, language };
          break;
        case 2:
          stepData = { departments: Array.from(selectedDepts) };
          break;
        case 3: {
          const validInvitations = invitations.filter((inv) => inv.email.trim());
          stepData = { invitations: validInvitations };
          break;
        }
        case 4: {
          const selectedModuleIds = modules.filter((m) => m.selected).map((m) => m.id);
          stepData = { module_ids: selectedModuleIds };
          break;
        }
        case 5: {
          const enabledLeaves = leaveTypes.filter((lt) => lt.enabled);
          stepData = {
            leave_types: enabledLeaves,
            shift: {
              name: shiftName,
              start_time: shiftStart + ":00",
              end_time: shiftEnd + ":00",
              break_minutes: 60,
              grace_minutes_late: 15,
              grace_minutes_early: 15,
            },
          };
          break;
        }
      }

      await api.post(`/onboarding/step/${activeStep}`, stepData);

      if (activeStep === 5) {
        await api.post("/onboarding/complete");
        navigate("/", { replace: true });
      } else {
        animateTransition("right", activeStep + 1);
      }
    } catch {
      // Errors are non-blocking for onboarding, advance anyway
      if (activeStep < 5) {
        animateTransition("right", activeStep + 1);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (activeStep > 1) {
      animateTransition("left", activeStep - 1);
    }
  };

  const handleSkipStep = async () => {
    if (activeStep < 5) {
      animateTransition("right", activeStep + 1);
    } else {
      setSubmitting(true);
      try {
        await api.post("/onboarding/complete");
      } catch {
        // ignore
      }
      navigate("/", { replace: true });
      setSubmitting(false);
    }
  };

  const handleSkipAll = async () => {
    setSubmitting(true);
    try {
      await api.post("/onboarding/skip");
    } catch {
      // ignore
    }
    navigate("/", { replace: true });
    setSubmitting(false);
  };

  // Department helpers
  const toggleDept = (name: string) => {
    setSelectedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const addCustomDept = () => {
    const name = customDept.trim();
    if (name && !departments.includes(name)) {
      setDepartments((prev) => [...prev, name]);
      setSelectedDepts((prev) => new Set([...prev, name]));
      setCustomDept("");
    }
  };

  // Invitation helpers
  const addInvitation = () => {
    setInvitations((prev) => [...prev, { email: "", role: "employee" }]);
  };

  const removeInvitation = (index: number) => {
    setInvitations((prev) => prev.filter((_, i) => i !== index));
  };

  const updateInvitation = (index: number, field: "email" | "role", value: string) => {
    setInvitations((prev) =>
      prev.map((inv, i) => (i === index ? { ...inv, [field]: value } : inv))
    );
  };

  // Module helpers
  const toggleModule = (id: number) => {
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, selected: !m.selected } : m))
    );
  };

  // Leave type helpers
  const toggleLeaveType = (index: number) => {
    setLeaveTypes((prev) =>
      prev.map((lt, i) => (i === index ? { ...lt, enabled: !lt.enabled } : lt))
    );
  };

  const updateLeaveQuota = (index: number, quota: number) => {
    setLeaveTypes((prev) =>
      prev.map((lt, i) => (i === index ? { ...lt, annual_quota: quota } : lt))
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const slideClass = animating
    ? direction === "right"
      ? "translate-x-8 opacity-0"
      : "-translate-x-8 opacity-0"
    : "translate-x-0 opacity-100";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-7 w-7 text-brand-600" />
            <span className="text-lg font-bold text-gray-900">EMP Cloud Setup</span>
          </div>
          <button
            onClick={handleSkipAll}
            disabled={submitting}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Skip setup &amp; go to dashboard
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white border-b border-gray-100 px-6 py-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Step {activeStep} of 5
            </span>
            <span className="text-sm text-gray-500">
              {Math.round((activeStep / 5) * 100)}% complete
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-6">
            <div
              className="h-full bg-brand-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(activeStep / 5) * 100}%` }}
            />
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-between">
            {STEP_ICONS.map((Icon, idx) => {
              const stepNum = idx + 1;
              const isActive = stepNum === activeStep;
              const isCompleted = status ? status.steps[idx]?.completed && stepNum < activeStep : stepNum < activeStep;

              return (
                <div key={idx} className="flex items-center">
                  {idx > 0 && (
                    <div
                      className={`hidden sm:block w-12 md:w-20 h-0.5 mx-1 transition-colors duration-300 ${
                        stepNum <= activeStep ? "bg-brand-600" : "bg-gray-200"
                      }`}
                    />
                  )}
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isCompleted
                          ? "bg-brand-600 text-white"
                          : isActive
                            ? "bg-brand-600 text-white ring-4 ring-brand-100"
                            : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium hidden sm:block ${
                        isActive ? "text-brand-600" : isCompleted ? "text-gray-700" : "text-gray-400"
                      }`}
                    >
                      {status?.steps[idx]?.name || `Step ${stepNum}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 px-4 py-8">
        <div className={`max-w-2xl mx-auto transition-all duration-200 ease-out ${slideClass}`}>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Step header */}
            <div className="px-8 pt-8 pb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {status?.steps[activeStep - 1]?.name || `Step ${activeStep}`}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {STEP_DESCRIPTIONS[activeStep - 1]}
              </p>
            </div>

            {/* Step body */}
            <div className="px-8 pb-8">
              {activeStep === 1 && (
                <Step1CompanyInfo
                  companyName={companyName}
                  setCompanyName={setCompanyName}
                  country={country}
                  setCountry={setCountry}
                  state={state}
                  setState={setState}
                  city={city}
                  setCity={setCity}
                  timezone={timezone}
                  setTimezone={setTimezone}
                  language={language}
                  setLanguage={setLanguage}
                  logoFile={logoFile}
                  logoPreview={logoPreview}
                  logoError={logoError}
                  onLogoSelected={(file, preview) => {
                    setLogoFile(file);
                    setLogoPreview(preview);
                    setLogoError(null);
                  }}
                  onLogoCleared={() => {
                    setLogoFile(null);
                    setLogoPreview(null);
                    setLogoError(null);
                  }}
                />
              )}

              {activeStep === 2 && (
                <Step2Departments
                  departments={departments}
                  selectedDepts={selectedDepts}
                  toggleDept={toggleDept}
                  customDept={customDept}
                  setCustomDept={setCustomDept}
                  addCustomDept={addCustomDept}
                />
              )}

              {activeStep === 3 && (
                <Step3InviteTeam
                  invitations={invitations}
                  addInvitation={addInvitation}
                  removeInvitation={removeInvitation}
                  updateInvitation={updateInvitation}
                />
              )}

              {activeStep === 4 && (
                <Step4Modules
                  modules={modules}
                  toggleModule={toggleModule}
                />
              )}

              {activeStep === 5 && (
                <Step5QuickSetup
                  leaveTypes={leaveTypes}
                  toggleLeaveType={toggleLeaveType}
                  updateLeaveQuota={updateLeaveQuota}
                  shiftName={shiftName}
                  setShiftName={setShiftName}
                  shiftStart={shiftStart}
                  setShiftStart={setShiftStart}
                  shiftEnd={shiftEnd}
                  setShiftEnd={setShiftEnd}
                  workDays={workDays}
                />
              )}
            </div>

            {/* Step footer */}
            <div className="px-8 py-5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <div>
                {activeStep > 1 ? (
                  <button
                    onClick={handleBack}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                ) : (
                  <div />
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSkipStep}
                  disabled={submitting}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
                >
                  Skip
                </button>
                <button
                  onClick={handleNext}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 bg-brand-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {activeStep === 5 ? (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Finish Setup
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Company Info
// ---------------------------------------------------------------------------

function Step1CompanyInfo({
  companyName,
  setCompanyName,
  country,
  setCountry,
  state,
  setState,
  city,
  setCity,
  timezone,
  setTimezone,
  language,
  setLanguage,
  logoFile,
  logoPreview,
  logoError,
  onLogoSelected,
  onLogoCleared,
}: {
  companyName: string;
  setCompanyName: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  state: string;
  setState: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  language: string;
  setLanguage: (v: string) => void;
  logoFile: File | null;
  logoPreview: string | null;
  logoError: string | null;
  onLogoSelected: (file: File, preview: string) => void;
  onLogoCleared: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const acceptFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (PNG, JPG, WebP, or SVG).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("Logo must be 2MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      onLogoSelected(file, e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-5 pt-2">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          placeholder="Acme Corp"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            placeholder="IN"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            placeholder="Karnataka"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            placeholder="Bengaluru"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Company Logo <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-brand-500 bg-brand-50"
              : logoPreview
                ? "border-gray-200 bg-gray-50"
                : "border-gray-200 hover:border-gray-300"
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) acceptFile(file);
          }}
        >
          {logoPreview ? (
            <div className="flex flex-col items-center gap-2">
              <img
                src={logoPreview}
                alt="Company logo preview"
                className="h-20 w-20 object-contain rounded"
              />
              <p className="text-xs text-gray-500">
                {logoFile?.name}{" "}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLogoCleared();
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-red-500 hover:text-red-600 ml-2"
                >
                  remove
                </button>
              </p>
            </div>
          ) : (
            <>
              <Building2 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                Drag &amp; drop your logo here, or click to browse
              </p>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP, SVG up to 2MB</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) acceptFile(file);
            }}
          />
        </div>
        {logoError && (
          <p className="mt-2 text-xs text-red-600">{logoError}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Departments
// ---------------------------------------------------------------------------

function Step2Departments({
  departments,
  selectedDepts,
  toggleDept,
  customDept,
  setCustomDept,
  addCustomDept,
}: {
  departments: string[];
  selectedDepts: Set<string>;
  toggleDept: (name: string) => void;
  customDept: string;
  setCustomDept: (v: string) => void;
  addCustomDept: () => void;
}) {
  return (
    <div className="space-y-5 pt-2">
      <p className="text-sm text-gray-500">
        Select the departments you want to create. You can always add more later.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {departments.map((dept) => {
          const isSelected = selectedDepts.has(dept);
          return (
            <button
              key={dept}
              onClick={() => toggleDept(dept)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium transition-all text-left ${
                isSelected
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              <div
                className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelected ? "bg-brand-600 text-white" : "bg-gray-100"
                }`}
              >
                {isSelected && <Check className="h-3.5 w-3.5" />}
              </div>
              {dept}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={customDept}
          onChange={(e) => setCustomDept(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustomDept()}
          className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          placeholder="Add custom department..."
        />
        <button
          onClick={addCustomDept}
          disabled={!customDept.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Invite Team
// ---------------------------------------------------------------------------

function Step3InviteTeam({
  invitations,
  addInvitation,
  removeInvitation,
  updateInvitation,
}: {
  invitations: Array<{ email: string; role: string }>;
  addInvitation: () => void;
  removeInvitation: (index: number) => void;
  updateInvitation: (index: number, field: "email" | "role", value: string) => void;
}) {
  return (
    <div className="space-y-5 pt-2">
      <p className="text-sm text-gray-500">
        Invite your team members by email. They will receive an invitation to join your organization.
      </p>

      <div className="space-y-3">
        {invitations.map((inv, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <input
              type="email"
              value={inv.email}
              onChange={(e) => updateInvitation(idx, "email", e.target.value)}
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              placeholder="colleague@company.com"
            />
            <select
              value={inv.role}
              onChange={(e) => updateInvitation(idx, "role", e.target.value)}
              className="w-36 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="hr_admin">HR Admin</option>
              <option value="org_admin">Admin</option>
            </select>
            {invitations.length > 1 && (
              <button
                onClick={() => removeInvitation(idx)}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addInvitation}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add another person
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Choose Modules
// ---------------------------------------------------------------------------

function Step4Modules({
  modules,
  toggleModule,
}: {
  modules: Array<{ id: number; name: string; slug: string; description: string; icon: string; selected: boolean }>;
  toggleModule: (id: number) => void;
}) {
  if (modules.length === 0) {
    return (
      <div className="pt-2 text-center py-12">
        <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No modules available at the moment.</p>
        <p className="text-xs text-gray-400 mt-1">
          You can subscribe to modules later from the Modules page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-2">
      <p className="text-sm text-gray-500">
        Choose the modules your organization needs. You will get a 14-day free trial for each.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {modules.map((mod) => (
          <button
            key={mod.id}
            onClick={() => toggleModule(mod.id)}
            className={`flex items-start gap-3 p-4 rounded-lg border text-left transition-all ${
              mod.selected
                ? "border-brand-500 bg-brand-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div
              className={`w-5 h-5 rounded mt-0.5 flex items-center justify-center flex-shrink-0 transition-colors ${
                mod.selected ? "bg-brand-600 text-white" : "bg-gray-100"
              }`}
            >
              {mod.selected && <Check className="h-3.5 w-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">{mod.name}</div>
              {mod.description && (
                <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{mod.description}</div>
              )}
              <div className="text-xs text-brand-600 font-medium mt-1">14-day free trial</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Quick Setup
// ---------------------------------------------------------------------------

function Step5QuickSetup({
  leaveTypes,
  toggleLeaveType,
  updateLeaveQuota,
  shiftName,
  setShiftName,
  shiftStart,
  setShiftStart,
  shiftEnd,
  setShiftEnd,
  workDays,
}: {
  leaveTypes: Array<{ name: string; code: string; annual_quota: number; enabled: boolean; description?: string }>;
  toggleLeaveType: (index: number) => void;
  updateLeaveQuota: (index: number, quota: number) => void;
  shiftName: string;
  setShiftName: (v: string) => void;
  shiftStart: string;
  setShiftStart: (v: string) => void;
  shiftEnd: string;
  setShiftEnd: (v: string) => void;
  workDays: string;
}) {
  return (
    <div className="space-y-6 pt-2">
      {/* Leave Types */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Default Leave Types</h3>
        <p className="text-xs text-gray-500 mb-3">
          Set up the standard leave types for your organization. You can customize these later.
        </p>

        <div className="space-y-3">
          {leaveTypes.map((lt, idx) => (
            <div
              key={lt.code}
              className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                lt.enabled ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"
              }`}
            >
              <button
                onClick={() => toggleLeaveType(idx)}
                className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                  lt.enabled ? "bg-brand-600 text-white" : "bg-gray-200"
                }`}
              >
                {lt.enabled && <Check className="h-3.5 w-3.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">{lt.name}</div>
                <div className="text-xs text-gray-500">{lt.code}</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={lt.annual_quota}
                  onChange={(e) => updateLeaveQuota(idx, parseInt(e.target.value) || 0)}
                  disabled={!lt.enabled}
                  className="w-16 px-2 py-1.5 border border-gray-300 rounded text-sm text-center focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none disabled:opacity-50"
                />
                <span className="text-xs text-gray-500">days/yr</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Default Shift */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Default Work Shift</h3>
        <p className="text-xs text-gray-500 mb-3">
          Set up the default working hours for your team.
        </p>

        <div className="p-4 rounded-lg border border-gray-200 bg-white space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shift Name</label>
            <input
              type="text"
              value={shiftName}
              onChange={(e) => setShiftName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input
                type="time"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Work Days</label>
              <input
                type="text"
                value={workDays}
                readOnly
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-600"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
