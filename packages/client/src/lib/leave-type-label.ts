import type { TFunction } from "i18next";

// Built-in leave codes mapped to their canonical English names. Used to detect
// seed/default leave types that should be localized via i18n. Admin-created
// types that reuse a built-in code (e.g. "Emergency Leave" with code EL, or
// "Menstrual Leave" with code ML) must keep their custom name verbatim.
const BUILTIN_EN: Record<string, string> = {
  CL: "Casual Leave",
  EL: "Earned Leave",
  SL: "Sick Leave",
  ML: "Maternity Leave",
  PL: "Paternity Leave",
  COMP_OFF: "Compensatory Off",
  UNPAID: "Unpaid Leave",
  MARRIAGE: "Marriage Leave",
  BEREAVEMENT: "Bereavement Leave",
};

export function leaveTypeLabel(
  t: TFunction,
  input: { code?: string | null; name?: string | null } | string | null | undefined,
): string {
  if (!input) return "-";
  const obj = typeof input === "string" ? { name: input } : input;
  const code = (obj.code ?? "").toUpperCase();
  const name = (obj.name ?? "").trim();

  const builtinName = BUILTIN_EN[code];
  if (builtinName && (!name || name.toLowerCase() === builtinName.toLowerCase())) {
    return t(`leave.types.${code}`, { defaultValue: builtinName });
  }
  return name || code || "-";
}
