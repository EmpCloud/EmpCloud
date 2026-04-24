import type { TFunction } from "i18next";

const KNOWN_CODES = new Set([
  "CL", "EL", "SL", "ML", "PL", "COMP_OFF", "UNPAID", "MARRIAGE", "BEREAVEMENT",
]);

/**
 * Localize a leave type's display name. For built-in codes, return the
 * translated string from `leave.types.{CODE}`. For custom (admin-created)
 * types, fall back to the stored `name` as-is.
 */
export function leaveTypeLabel(
  t: TFunction,
  input: { code?: string | null; name?: string | null } | string | null | undefined,
): string {
  if (!input) return "-";
  const obj = typeof input === "string" ? { name: input } : input;
  const code = (obj.code ?? "").toUpperCase();
  const name = obj.name ?? "";

  if (code && KNOWN_CODES.has(code)) {
    return t(`leave.types.${code}`, { defaultValue: name || code });
  }
  return name || code || "-";
}
