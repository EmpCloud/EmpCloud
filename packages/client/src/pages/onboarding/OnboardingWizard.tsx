import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { leaveTypeLabel } from "@/lib/leave-type-label";
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
import { showToast } from "@/components/ui/Toast";

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
  const [modules, setModules] = useState<Array<{ id: number; name: string; slug: string; description: string; icon: string; selected: boolean; plan_tier: string; total_seats: number }>>([]);
  const [skipTrial, setSkipTrial] = useState(false);

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
          plan_tier: "basic",
          total_seats: 10,
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
          const selectedModules = modules
            .filter((m) => m.selected)
            .map((m) => ({
              module_id: m.id,
              plan_tier: m.plan_tier,
              total_seats: m.total_seats,
            }));
          // Module selection is mandatory — the wizard cannot advance past
          // step 4 until at least one module is chosen. Return (not throw):
          // the catch block below advances the step on error, so throwing
          // here would defeat the gate.
          //
          // BUT only gate when modules actually loaded. If the /modules fetch
          // returned empty (API error, or genuinely no active modules), there
          // is nothing to select — gating here would hard-lock the new admin
          // at step 4 with RequireOnboarding also blocking the rest of the app.
          if (modules.length > 0 && selectedModules.length === 0) {
            showToast("error", "Please select at least one module to continue.");
            return;
          }
          stepData = { modules: selectedModules, skip_trial: skipTrial };
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

  // Step 4 gate: at least one module must be selected before the wizard
  // can advance past the Choose Modules step.
  const selectedModuleCount = modules.filter((m) => m.selected).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-muted/50">
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
    <div className="min-h-screen bg-muted/50 flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-7 w-7 text-brand-600" />
            <span className="text-base font-semibold tracking-tight text-foreground">EMP Cloud Setup</span>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-card border-b border-border px-6 py-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium text-foreground tabular-nums">
              Step {activeStep} of 5
            </span>
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {Math.round((activeStep / 5) * 100)}% complete
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-6">
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
                        stepNum <= activeStep ? "bg-brand-600" : "bg-muted"
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
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-medium hidden sm:block ${
                        isActive ? "text-brand-600" : isCompleted ? "text-foreground" : "text-muted-foreground"
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
          <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            {/* Step header */}
            <div className="px-8 pt-8 pb-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {status?.steps[activeStep - 1]?.name || `Step ${activeStep}`}
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">
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
                  updateModulePlan={(id, plan_tier) =>
                    setModules((prev) =>
                      prev.map((m) => (m.id === id ? { ...m, plan_tier } : m)),
                    )
                  }
                  updateModuleSeats={(id, total_seats) =>
                    setModules((prev) =>
                      prev.map((m) => (m.id === id ? { ...m, total_seats } : m)),
                    )
                  }
                  skipTrial={skipTrial}
                  setSkipTrial={setSkipTrial}
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
            <div className="px-8 py-5 bg-muted/50 border-t border-border flex items-center justify-between">
              <div>
                {activeStep > 1 ? (
                  <button
                    onClick={handleBack}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
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
                  onClick={handleNext}
                  disabled={submitting || (activeStep === 4 && modules.length > 0 && selectedModuleCount === 0)}
                  title={activeStep === 4 && modules.length > 0 && selectedModuleCount === 0 ? "Select at least one module to continue" : undefined}
                  className="inline-flex items-center gap-2 bg-brand-600 text-white px-5 py-2.5 rounded-md text-[13px] font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      showToast("error", "Please upload an image file (PNG, JPG, WebP, or SVG).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast("error", "Logo must be 2MB or smaller.");
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
        <label className="block text-[13px] font-medium text-foreground mb-1">Company Name</label>
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="w-full px-3 py-2.5 border border-border rounded-md text-[13px] bg-card text-foreground focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          placeholder="Acme Corp"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1">Country</label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full px-3 py-2.5 border border-border rounded-md text-[13px] bg-card text-foreground focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            placeholder="IN"
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1">State</label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full px-3 py-2.5 border border-border rounded-md text-[13px] bg-card text-foreground focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            placeholder="Karnataka"
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1">City</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full px-3 py-2.5 border border-border rounded-md text-[13px] bg-card text-foreground focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            placeholder="Bengaluru"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2.5 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-card text-foreground"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[13px] font-medium text-foreground mb-1">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-3 py-2.5 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-card text-foreground"
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
        <label className="block text-[13px] font-medium text-foreground mb-1">
          Company Logo <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <div
          className={`border-2 border-dashed rounded-md p-4 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-brand-500 bg-brand-50"
              : logoPreview
                ? "border-border bg-muted/50"
                : "border-border hover:border-brand-400"
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
              <p className="text-[11px] text-muted-foreground">
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
              <Building2 className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-[13px] text-muted-foreground">
                Drag &amp; drop your logo here, or click to browse
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">PNG, JPG, WebP, SVG up to 2MB</p>
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
          <p className="mt-2 text-[11px] text-red-600">{logoError}</p>
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
      <p className="text-[13px] text-muted-foreground">
        Select the departments you want to create. You can always add more later.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {departments.map((dept) => {
          const isSelected = selectedDepts.has(dept);
          return (
            <button
              key={dept}
              onClick={() => toggleDept(dept)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-[13px] font-medium transition-all text-left ${
                isSelected
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-border bg-card text-muted-foreground hover:border-brand-400"
              }`}
            >
              <div
                className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelected ? "bg-brand-600 text-white" : "bg-muted"
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
          className="flex-1 px-3 py-2.5 border border-border rounded-md text-[13px] bg-card text-foreground focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          placeholder="Add custom department..."
        />
        <button
          onClick={addCustomDept}
          disabled={!customDept.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-muted text-foreground rounded-md text-[13px] font-medium hover:bg-muted-foreground/10 disabled:opacity-50 transition-colors"
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
      <p className="text-[13px] text-muted-foreground">
        Invite your team members by email. They will receive an invitation to join your organization.
      </p>

      <div className="space-y-3">
        {invitations.map((inv, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <input
              type="email"
              value={inv.email}
              onChange={(e) => updateInvitation(idx, "email", e.target.value)}
              className="flex-1 px-3 py-2.5 border border-border rounded-md text-[13px] bg-card text-foreground focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              placeholder="colleague@company.com"
            />
            <select
              value={inv.role}
              onChange={(e) => updateInvitation(idx, "role", e.target.value)}
              className="w-36 px-3 py-2.5 border border-border rounded-md text-[13px] focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-card text-foreground"
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="hr_admin">HR Admin</option>
              <option value="org_admin">Admin</option>
            </select>
            {invitations.length > 1 && (
              <button
                onClick={() => removeInvitation(idx)}
                className="p-2 text-muted-foreground hover:text-red-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addInvitation}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:text-brand-700 transition-colors"
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
  updateModulePlan,
  updateModuleSeats,
  skipTrial,
  setSkipTrial,
}: {
  modules: Array<{ id: number; name: string; slug: string; description: string; icon: string; selected: boolean; plan_tier: string; total_seats: number }>;
  toggleModule: (id: number) => void;
  updateModulePlan: (id: number, plan_tier: string) => void;
  updateModuleSeats: (id: number, total_seats: number) => void;
  skipTrial: boolean;
  setSkipTrial: (v: boolean) => void;
}) {
  if (modules.length === 0) {
    return (
      <div className="pt-2 text-center py-12">
        <Package className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-[13px] text-muted-foreground">No modules available at the moment.</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          You can subscribe to modules later from the Modules page.
        </p>
      </div>
    );
  }

  const PLAN_TIERS = [
    { value: "basic", label: "Basic" },
    { value: "professional", label: "Professional" },
    { value: "enterprise", label: "Enterprise" },
  ];

  const selectedCount = modules.filter((m) => m.selected).length;

  return (
    <div className="space-y-5 pt-2">
      <p className="text-[13px] text-muted-foreground">
        Choose the modules your organization needs, then set the plan tier and number of licenses for each.
      </p>

      {selectedCount === 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-[13px] text-amber-800 dark:text-amber-200">
          <Package className="h-4 w-4 shrink-0" />
          Select at least one module to continue — this step can't be skipped.
        </div>
      )}

      <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/50 cursor-pointer hover:bg-muted transition-colors">
        <input
          type="checkbox"
          checked={skipTrial}
          onChange={(e) => setSkipTrial(e.target.checked)}
          className="mt-0.5 rounded border-border"
        />
        <div>
          <div className="text-[13px] font-medium text-foreground">Skip trial — start paid subscription immediately</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            When checked, subscriptions are activated right away and an invoice is generated for each module. Leave unchecked to get a 14-day free trial.
          </div>
        </div>
      </label>

      <div className="space-y-3">
        {modules.map((mod) => (
          <div
            key={mod.id}
            className={`rounded-lg border transition-all ${
              mod.selected ? "border-brand-500 dark:bg-brand-950/40 bg-brand-50" : "border-border bg-card"
            }`}
          >
            <button
              onClick={() => toggleModule(mod.id)}
              className="w-full flex items-start gap-3 p-4 text-left"
            >
              <div
                className={`w-5 h-5 rounded mt-0.5 flex items-center justify-center flex-shrink-0 transition-colors ${
                  mod.selected ? "bg-brand-600 text-white" : "bg-muted"
                }`}
              >
                {mod.selected && <Check className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-foreground">{mod.name}</div>
                {mod.description && (
                  <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{mod.description}</div>
                )}
              </div>
            </button>
            {mod.selected && (
              <div className="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-brand-100">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">Plan tier</label>
                  <select
                    value={mod.plan_tier}
                    onChange={(e) => updateModulePlan(mod.id, e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-card text-foreground focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  >
                    {PLAN_TIERS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">Licenses (seats)</label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={mod.total_seats}
                    onChange={(e) => updateModuleSeats(mod.id, Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-card text-foreground focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  />
                </div>
              </div>
            )}
          </div>
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
  const { t } = useTranslation();
  return (
    <div className="space-y-6 pt-2">
      {/* Leave Types */}
      <div>
        <h3 className="text-[13px] font-semibold text-foreground mb-1">Default Leave Types</h3>
        <p className="text-[11px] text-muted-foreground mb-3">
          Set up the standard leave types for your organization. You can customize these later.
        </p>

        <div className="space-y-3">
          {leaveTypes.map((lt, idx) => (
            <div
              key={lt.code}
              className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                lt.enabled ? "border-border bg-card" : "border-border bg-muted/50 opacity-60"
              }`}
            >
              <button
                onClick={() => toggleLeaveType(idx)}
                className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                  lt.enabled ? "bg-brand-600 text-white" : "bg-muted"
                }`}
              >
                {lt.enabled && <Check className="h-3.5 w-3.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-foreground">{leaveTypeLabel(t, lt)}</div>
                <div className="text-[11px] text-muted-foreground">{lt.code}</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={lt.annual_quota}
                  onChange={(e) => updateLeaveQuota(idx, parseInt(e.target.value) || 0)}
                  disabled={!lt.enabled}
                  className="w-16 px-2 py-1.5 border border-border rounded text-[13px] text-center focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none disabled:opacity-50"
                />
                <span className="text-[11px] text-muted-foreground">days/yr</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Default Shift */}
      <div>
        <h3 className="text-[13px] font-semibold text-foreground mb-1">Default Work Shift</h3>
        <p className="text-[11px] text-muted-foreground mb-3">
          Set up the default working hours for your team.
        </p>

        <div className="p-4 rounded-lg border border-border bg-card space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-foreground mb-1">Shift Name</label>
            <input
              type="text"
              value={shiftName}
              onChange={(e) => setShiftName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-card text-foreground focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">Start Time</label>
              <input
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-card text-foreground focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">End Time</label>
              <input
                type="time"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-card text-foreground focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">Work Days</label>
              <input
                type="text"
                value={workDays}
                readOnly
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-muted/50 text-muted-foreground"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
