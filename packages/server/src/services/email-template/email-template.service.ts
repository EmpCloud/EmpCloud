// =============================================================================
// EMP CLOUD — Email Template Service
// Org-scoped, admin-customizable email templates (subject + message body with
// {{placeholders}}). Falls back to a built-in default when an org hasn't
// customized a given template yet. First consumer: probation confirmation.
//
// Placeholders are substituted at send time. NO HTML-escaping happens here —
// the email renderer (email.service.ts) escapes the final message before it
// goes into the branded layout, so the stored/edited text stays clean and
// readable for the admin editing it.
// =============================================================================

import { getDB } from "../../db/connection.js";

export interface ResolvedTemplate {
  template_key: string;
  name: string;
  subject: string;
  body: string;
  is_default: boolean;
}

// Built-in defaults — used until an org saves its own version.
export const DEFAULT_TEMPLATES: Record<string, { name: string; subject: string; body: string }> = {
  probation_confirmation: {
    name: "Probation Confirmation",
    subject: "Probation Confirmed — Welcome aboard, {{first_name}}!",
    body: [
      "Dear {{employee_name}},",
      "",
      "We are delighted to confirm that you have successfully completed your probation period as {{designation}} at {{company_name}}, with effect from {{confirmation_date}}.",
      "",
      "Your contributions during this period have been truly valued, and we look forward to your continued growth with us.",
      "",
      "Congratulations once again, and welcome aboard as a confirmed member of the team!",
      "",
      "Warm regards,",
      "{{company_name}} — HR Team",
    ].join("\n"),
  },
};

export async function getTemplate(orgId: number, key: string) {
  const db = getDB();
  return db("email_templates")
    .where({ organization_id: orgId, template_key: key })
    .first();
}

/** The org's saved template, or the built-in default when none is saved. */
export async function getTemplateOrDefault(orgId: number, key: string): Promise<ResolvedTemplate> {
  const saved = await getTemplate(orgId, key);
  if (saved) {
    return {
      template_key: key,
      name: saved.name,
      subject: saved.subject,
      body: saved.body,
      is_default: false,
    };
  }
  const def = DEFAULT_TEMPLATES[key];
  return {
    template_key: key,
    name: def?.name ?? key,
    subject: def?.subject ?? "",
    body: def?.body ?? "",
    is_default: true,
  };
}

export async function upsertTemplate(
  orgId: number,
  key: string,
  data: { name?: string; subject: string; body: string },
  userId: number,
): Promise<ResolvedTemplate> {
  const db = getDB();
  const name = (data.name?.trim() || DEFAULT_TEMPLATES[key]?.name || key).slice(0, 150);
  const subject = data.subject.trim().slice(0, 255);
  const body = data.body;

  const existing = await getTemplate(orgId, key);
  if (existing) {
    await db("email_templates").where({ id: existing.id }).update({
      name,
      subject,
      body,
      updated_by: userId,
      updated_at: new Date(),
    });
  } else {
    await db("email_templates").insert({
      organization_id: orgId,
      template_key: key,
      name,
      subject,
      body,
      is_active: true,
      updated_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  return getTemplateOrDefault(orgId, key);
}

/**
 * Replace {{ token }} occurrences with the matching var. Unknown tokens
 * collapse to an empty string so a stray placeholder never leaks into a sent
 * email. Case-insensitive on the token name.
 */
export function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, token: string) => {
    const v = vars[token.toLowerCase()];
    return v == null ? "" : String(v);
  });
}

export function renderTemplate(
  tpl: { subject: string; body: string },
  vars: Record<string, string>,
): { subject: string; body: string } {
  return {
    subject: substitute(tpl.subject, vars),
    body: substitute(tpl.body, vars),
  };
}
