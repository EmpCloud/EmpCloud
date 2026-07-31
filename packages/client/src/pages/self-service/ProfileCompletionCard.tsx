// =============================================================================
// EMP CLOUD — Profile completion card (employee self-service dashboard)
//
// Nudges employees to finish their profile: fetches their profile, scores it
// against a checklist of the fields THEY can fill (personal + emergency + KYC),
// and shows a progress ring plus what's still missing, linking to the edit page.
// =============================================================================

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { UserCheck, ArrowRight, Check } from "lucide-react";
import api from "@/api/client";

type FieldCheck = {
  key: string;
  label: string;
  filled: (p: Record<string, any>) => boolean;
};

const nonEmpty = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";

// Only fields an employee can actually complete themselves — HR-owned fields
// (department, designation, manager) are excluded so the score reflects the
// employee's own to-do list.
const FIELDS: FieldCheck[] = [
  // has_biometric_face comes back as a boolean from the API (a kiosk-enrolled
  // face counts as a profile photo), so test it truthily — not `=== 1`.
  { key: "photo", label: "Profile photo", filled: (p) => nonEmpty(p.photo_path) || Boolean(p.has_biometric_face) },
  { key: "contact_number", label: "Phone number", filled: (p) => nonEmpty(p.contact_number) },
  { key: "date_of_birth", label: "Date of birth", filled: (p) => nonEmpty(p.date_of_birth) },
  { key: "gender", label: "Gender", filled: (p) => nonEmpty(p.gender) },
  { key: "personal_email", label: "Personal email", filled: (p) => nonEmpty(p.personal_email) },
  { key: "emergency_contact_name", label: "Emergency contact", filled: (p) => nonEmpty(p.emergency_contact_name) },
  { key: "emergency_contact_phone", label: "Emergency phone", filled: (p) => nonEmpty(p.emergency_contact_phone) },
  { key: "blood_group", label: "Blood group", filled: (p) => nonEmpty(p.blood_group) },
  { key: "marital_status", label: "Marital status", filled: (p) => nonEmpty(p.marital_status) },
  { key: "nationality", label: "Nationality", filled: (p) => nonEmpty(p.nationality) },
  { key: "aadhar_number", label: "Aadhaar number", filled: (p) => nonEmpty(p.aadhar_number) },
  { key: "pan_number", label: "PAN number", filled: (p) => nonEmpty(p.pan_number) },
];

function Ring({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const stroke = pct >= 100 ? "text-green-500" : pct >= 60 ? "text-brand-500" : "text-amber-500";
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} strokeWidth="6" className="fill-none stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          strokeWidth="6"
          strokeLinecap="round"
          className={`fill-none stroke-current transition-all duration-500 ${stroke}`}
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

export function ProfileCompletionCard({ userId }: { userId: number | undefined }) {
  const { t } = useTranslation();
  const { data: profile } = useQuery({
    queryKey: ["self-profile-completion", userId],
    queryFn: () => api.get(`/employees/${userId}/profile`).then((r) => r.data.data),
    enabled: !!userId,
  });

  const { pct, missing } = useMemo(() => {
    if (!profile) return { pct: 0, missing: [] as FieldCheck[] };
    const miss = FIELDS.filter((f) => !f.filled(profile));
    return {
      pct: Math.round(((FIELDS.length - miss.length) / FIELDS.length) * 100),
      missing: miss,
    };
  }, [profile]);

  if (!profile) return null;

  const complete = pct >= 100;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-4">
        <Ring pct={pct} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <UserCheck className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="text-sm font-semibold text-foreground">
              {t("profileCompletion.title", { defaultValue: "Profile completion" })}
            </h3>
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {complete
              ? t("profileCompletion.done", { defaultValue: "Your profile is all set — nice work!" })
              : t("profileCompletion.subtitle", {
                  defaultValue: "Complete your profile so HR has everything on file.",
                })}
          </p>
        </div>
      </div>

      {!complete && (
        <>
          {/* Up to 4 missing items as chips, with a "+N more" overflow. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {missing.slice(0, 4).map((f) => (
              <span
                key={f.key}
                className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              >
                {t(`profileCompletion.fields.${f.key}`, { defaultValue: f.label })}
              </span>
            ))}
            {missing.length > 4 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {t("profileCompletion.more", { defaultValue: "+{{count}} more", count: missing.length - 4 })}
              </span>
            )}
          </div>
          <Link
            to={`/employees/${userId}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-700"
          >
            {t("profileCompletion.cta", { defaultValue: "Complete profile" })}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </>
      )}

      {complete && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-[13px] font-medium text-green-700 dark:bg-green-950/40 dark:text-green-300">
          <Check className="h-3.5 w-3.5" /> {t("profileCompletion.completeBadge", { defaultValue: "All fields complete" })}
        </div>
      )}
    </div>
  );
}

export default ProfileCompletionCard;
