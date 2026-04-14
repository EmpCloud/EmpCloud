// =============================================================================
// EMP CLOUD — Email Service
//
// Thin wrapper around @sendgrid/mail with inline HTML templates for the
// transactional emails EMP Cloud sends: password reset, user invitation,
// and post-registration welcome.
//
// Behavior:
// - If SENDGRID_API_KEY is not set, sendEmail() becomes a no-op and logs
//   the message at info level. This keeps local dev working without a real
//   SendGrid account and also keeps tests deterministic.
// - If the SendGrid call throws, the error is caught and logged but NOT
//   rethrown — email failures never block the underlying flow (password
//   reset token is still created, invitation is still stored in the DB,
//   etc.). Users can always retry or the admin can re-send manually.
// =============================================================================

import sgMail from "@sendgrid/mail";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  if (config.email.sendgridApiKey) {
    sgMail.setApiKey(config.email.sendgridApiKey);
  }
  initialized = true;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send a transactional email via SendGrid. Silently no-ops (with a log
 * line) when SENDGRID_API_KEY is missing so dev environments don't need
 * to be configured.
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  ensureInitialized();

  if (!config.email.sendgridApiKey) {
    logger.info(
      `[email] SENDGRID_API_KEY not set — skipping send to ${params.to} "${params.subject}"`,
    );
    return;
  }

  try {
    await sgMail.send({
      to: params.to,
      from: {
        email: config.email.fromEmail,
        name: config.email.fromName,
      },
      subject: params.subject,
      html: params.html,
      text: params.text || htmlToPlainText(params.html),
    });
    logger.info(`[email] sent "${params.subject}" to ${params.to}`);
  } catch (err: any) {
    // SendGrid errors carry helpful info in err.response.body — surface it.
    const detail =
      err?.response?.body?.errors
        ?.map((e: any) => e.message)
        .join("; ") || err?.message || String(err);
    logger.error(`[email] send failed for ${params.to} "${params.subject}": ${detail}`);
    // Swallow — caller's flow shouldn't break on email failure.
  }
}

/** Very rough HTML → plain-text fallback for the `text` body. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------

function layout(innerHtml: string, preheader: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EMP Cloud</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
<span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f8;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="padding:28px 32px;border-bottom:1px solid #e5e7eb;">
<div style="font-weight:700;font-size:18px;color:#2563eb;">EMP Cloud</div>
</td></tr>
<tr><td style="padding:32px;">${innerHtml}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;font-size:12px;text-align:center;">
Sent by EMP Cloud &bull; If you didn't expect this email, you can safely ignore it.
</td></tr>
</table></td></tr></table></body></html>`;
}

function button(label: string, href: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
<tr><td style="border-radius:8px;background:#2563eb;">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Specific emails
// ---------------------------------------------------------------------------

/**
 * Password reset email — sent when a user requests to reset their password.
 * Contains a link back to the EMP Cloud client's reset page with the
 * single-use token.
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  firstName: string;
  token: string;
}): Promise<void> {
  const url = `${config.email.appUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(params.token)}`;
  const greeting = params.firstName ? `Hi ${escapeHtml(params.firstName)},` : "Hi,";

  const html = layout(
    `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">Reset your password</h1>
    <p style="margin:0 0 12px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 12px;line-height:1.6;">We received a request to reset the password on your EMP Cloud account. Click the button below to choose a new password. The link is valid for one hour.</p>
    ${button("Reset my password", url)}
    <p style="margin:0 0 12px;line-height:1.6;color:#6b7280;font-size:13px;">If the button doesn't work, paste this link into your browser:</p>
    <p style="margin:0 0 12px;word-break:break-all;font-size:13px;"><a href="${escapeHtml(url)}" style="color:#2563eb;">${escapeHtml(url)}</a></p>
    <p style="margin:24px 0 0;line-height:1.6;color:#6b7280;font-size:13px;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
    `,
    "Reset your EMP Cloud password",
  );

  await sendEmail({
    to: params.to,
    subject: "Reset your EMP Cloud password",
    html,
  });
}

/**
 * Invitation email — sent when an org admin invites a new user to join.
 * The accept-invitation link takes them to a page that sets their password
 * and activates their user record.
 */
export async function sendInvitationEmail(params: {
  to: string;
  firstName?: string | null;
  orgName: string;
  invitedByName: string;
  role: string;
  token: string;
}): Promise<void> {
  const url = `${config.email.appUrl.replace(/\/+$/, "")}/accept-invitation?token=${encodeURIComponent(params.token)}`;
  const greeting = params.firstName ? `Hi ${escapeHtml(params.firstName)},` : "Hi,";
  const roleLabel = escapeHtml(params.role.replace(/_/g, " "));

  const html = layout(
    `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">You're invited to join ${escapeHtml(params.orgName)}</h1>
    <p style="margin:0 0 12px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 12px;line-height:1.6;"><strong>${escapeHtml(params.invitedByName)}</strong> has invited you to join <strong>${escapeHtml(params.orgName)}</strong> on EMP Cloud as a <strong>${roleLabel}</strong>.</p>
    <p style="margin:0 0 12px;line-height:1.6;">Click the button below to accept the invitation and set up your account. This link is valid for 7 days.</p>
    ${button("Accept invitation", url)}
    <p style="margin:0 0 12px;line-height:1.6;color:#6b7280;font-size:13px;">If the button doesn't work, paste this link into your browser:</p>
    <p style="margin:0 0 12px;word-break:break-all;font-size:13px;"><a href="${escapeHtml(url)}" style="color:#2563eb;">${escapeHtml(url)}</a></p>
    `,
    `You've been invited to join ${params.orgName} on EMP Cloud`,
  );

  await sendEmail({
    to: params.to,
    subject: `You've been invited to join ${params.orgName} on EMP Cloud`,
    html,
  });
}

/**
 * Welcome email — sent after a brand-new org admin finishes registration.
 * Sign-in link takes them straight to the dashboard.
 */
export async function sendWelcomeEmail(params: {
  to: string;
  firstName: string;
  orgName: string;
}): Promise<void> {
  const url = `${config.email.appUrl.replace(/\/+$/, "")}/login`;

  const html = layout(
    `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">Welcome to EMP Cloud, ${escapeHtml(params.firstName)}!</h1>
    <p style="margin:0 0 12px;line-height:1.6;">Your organization <strong>${escapeHtml(params.orgName)}</strong> is ready on EMP Cloud. You can sign in any time to start managing your workforce, onboarding employees, tracking leave, running payroll and more.</p>
    ${button("Sign in to EMP Cloud", url)}
    <p style="margin:24px 0 12px;line-height:1.6;font-weight:600;color:#111827;">What's next?</p>
    <ul style="margin:0 0 16px;padding-left:20px;line-height:1.8;color:#374151;">
      <li>Finish the onboarding wizard to add departments, locations and an office calendar</li>
      <li>Invite your team — they'll receive an email to set up their account</li>
      <li>Enable the modules (Payroll, Recruit, Exit, etc.) your company needs</li>
    </ul>
    <p style="margin:0;line-height:1.6;color:#6b7280;font-size:13px;">If you have any questions, just reply to this email — we're happy to help.</p>
    `,
    `Welcome to EMP Cloud, ${params.firstName}!`,
  );

  await sendEmail({
    to: params.to,
    subject: `Welcome to EMP Cloud, ${params.firstName}!`,
    html,
  });
}
