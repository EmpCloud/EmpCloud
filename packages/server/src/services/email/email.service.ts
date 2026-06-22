// =============================================================================
// EMP CLOUD — Email Service
//
// Inline HTML templates for the transactional emails EMP Cloud sends:
// password reset, user invitation, and post-registration welcome.
//
// Transport selection (in order):
//   1. SendGrid — when SENDGRID_API_KEY is set. Preferred in prod.
//   2. SMTP via nodemailer — when SMTP_HOST is set. Used by local dev
//      pointing at Mailpit/MailHog (no SendGrid account required) and by
//      self-hosted deployments using their own mail relay.
//   3. No-op — neither configured. sendEmail() logs the would-be delivery
//      at info level and returns. Keeps dev working with zero config and
//      keeps tests deterministic.
//
// Failures are caught and logged but NEVER rethrown — email failures must
// never break the underlying flow (the reset token is still created in
// the DB, the invitation row is still stored, etc.). Users can retry or
// the admin can re-send manually.
// =============================================================================

import sgMail from "@sendgrid/mail";
import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";

let sendgridReady = false;
let smtpTransporter: Transporter | null = null;

function ensureSendgrid(): boolean {
  if (sendgridReady) return true;
  if (!config.email.sendgridApiKey) return false;
  sgMail.setApiKey(config.email.sendgridApiKey);
  sendgridReady = true;
  return true;
}

function ensureSmtp(): Transporter | null {
  if (smtpTransporter) return smtpTransporter;
  const { smtp } = config.email;
  if (!smtp.host) return null;
  smtpTransporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    // Mailpit/MailHog accept anonymous SMTP — only attach auth when both
    // user and pass are set so empty values don't trigger an auth attempt.
    auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  return smtpTransporter;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send a transactional email. Tries SendGrid first, falls back to SMTP,
 * and finally no-ops with a log line when neither is configured.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  if (ensureSendgrid()) {
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
      logger.info(`[email] sent via SendGrid "${params.subject}" to ${params.to}`);
      return true;
    } catch (err: any) {
      const detail =
        err?.response?.body?.errors?.map((e: any) => e.message).join("; ") ||
        err?.message ||
        String(err);
      logger.error(
        `[email] SendGrid send failed for ${params.to} "${params.subject}": ${detail}`,
      );
      // Don't rethrow — fall through and try SMTP if configured. If SMTP
      // also fails, the error is logged and the caller's flow continues.
    }
  }

  const smtp = ensureSmtp();
  if (smtp) {
    try {
      await smtp.sendMail({
        from: { address: config.email.fromEmail, name: config.email.fromName },
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text || htmlToPlainText(params.html),
      });
      logger.info(`[email] sent via SMTP "${params.subject}" to ${params.to}`);
      return true;
    } catch (err: any) {
      logger.error(
        `[email] SMTP send failed for ${params.to} "${params.subject}": ${err?.message || err}`,
      );
      // Swallow — caller's flow continues even if delivery fails.
      return false;
    }
  }

  logger.info(
    `[email] no transport configured (set SENDGRID_API_KEY or SMTP_HOST) — skipping send to ${params.to} "${params.subject}"`,
  );
  return false;
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

function logoUrl(): string {
  return `${config.baseUrl.replace(/\/+$/, "")}/static/empcloud.png`;
}

function layout(innerHtml: string, preheader: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EMP Cloud</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
<span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f8;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td align="center" style="padding:28px 32px;border-bottom:1px solid #e5e7eb;text-align:center;">
<img src="${escapeHtml(logoUrl())}" alt="EMP Cloud" width="160" style="display:block;margin:0 auto;max-width:160px;height:auto;border:0;outline:none;text-decoration:none;">
</td></tr>
<tr><td style="padding:32px;">${innerHtml}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;font-size:12px;text-align:center;">
Sent by EMP Cloud • If you didn't expect this email, you can safely ignore it.
</td></tr>
</table></td></tr></table></body></html>`;
}

function button(label: string, href: string): string {
  // Centered via an outer wrapper table with align="center" + text-align,
  // which is the only combo that holds across Gmail, Apple Mail, Outlook
  // (incl. older Outlook on Windows which ignores `margin:auto` on tables)
  // and the major webmail clients. The inner table keeps the rounded
  // background pill that wraps the anchor.
  return `<table role="presentation" align="center" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0;border-collapse:collapse;">
<tr><td align="center" style="text-align:center;">
<table role="presentation" align="center" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;border-collapse:collapse;">
<tr><td style="border-radius:8px;background:#2563eb;">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
</td></tr></table>
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

/**
 * Turn a plain-text message (blank-line-separated paragraphs, single newlines
 * within a paragraph) into branded HTML paragraphs. The text is HTML-escaped
 * first, so an admin-authored template body is treated as plain text — exactly
 * what the "simple" template editor promises — and can never inject markup.
 */
function messageToParagraphs(message: string): string {
  return message
    .split(/\n{2,}/)
    .map((para) => {
      const html = escapeHtml(para.trim()).replace(/\n/g, "<br>");
      return html ? `<p style="margin:0 0 12px;line-height:1.6;">${html}</p>` : "";
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Send a branded email from a plain-text message body — used by the
 * template-driven emails (e.g. probation confirmation). Wraps the message in
 * the same header/footer layout as the transactional emails. Returns whether a
 * transport actually accepted the message.
 */
export function renderBrandedEmail(message: string): { html: string; text: string } {
  return {
    // Empty preheader: the subject is already the email's subject line, and
    // passing it here duplicated it as a redundant heading at the top of the
    // email body in some clients. The plain-text alternative is just the
    // message itself — clean, with no layout chrome or HTML entities.
    html: layout(messageToParagraphs(message), ""),
    text: message,
  };
}

export async function sendBrandedEmail(params: {
  to: string;
  subject: string;
  message: string;
}): Promise<boolean> {
  const { html, text } = renderBrandedEmail(params.message);
  return sendEmail({ to: params.to, subject: params.subject, html, text });
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
 * Email-change notification — sent to BOTH the old and new addresses
 * after an HR admin updates an employee's login email. Same branded
 * layout the password-reset / invitation emails use, so it doesn't
 * read as a phishing attempt next to those.
 *
 * recipientType differentiates the explanatory line:
 *   "old" → "This message was sent to your previous address."
 *   "new" → "This message was sent to your new address as confirmation."
 */
export async function sendEmailChangedNotification(params: {
  to: string;
  firstName?: string | null;
  oldEmail: string;
  newEmail: string;
  recipientType: "old" | "new";
}): Promise<void> {
  const greeting = params.firstName ? `Hi ${escapeHtml(params.firstName)},` : "Hi,";
  const recipientNote =
    params.recipientType === "old"
      ? "This message was sent to your previous address as a security notice."
      : "This message was sent to your new address as confirmation. Use it to sign in from now on.";
  const loginUrl = `${config.email.appUrl.replace(/\/+$/, "")}/login`;
  const html = layout(
    `
    <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">Your EMP Cloud login email was changed</h1>
    <p style="margin:0 0 12px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;line-height:1.6;">Your administrator updated the email you use to sign in to EMP Cloud.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;width:100%;">
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;width:120px;">Previous email</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;font-family:ui-monospace,Consolas,monospace;">${escapeHtml(params.oldEmail)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">New email</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;font-family:ui-monospace,Consolas,monospace;border-top:1px solid #e5e7eb;font-weight:600;">${escapeHtml(params.newEmail)}</td>
      </tr>
    </table>
    <p style="margin:0 0 16px;line-height:1.6;color:#374151;">${recipientNote}</p>
    ${button("Sign in to EMP Cloud", loginUrl)}
    <p style="margin:24px 0 0;line-height:1.6;color:#dc2626;font-size:13px;"><strong>Didn't request this change?</strong> Contact your HR administrator immediately — your account may have been compromised.</p>
    `,
    "Your EMP Cloud login email was changed",
  );

  await sendEmail({
    to: params.to,
    subject: "Your EMP Cloud login email was changed",
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
