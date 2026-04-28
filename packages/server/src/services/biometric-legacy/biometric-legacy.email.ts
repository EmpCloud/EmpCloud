// =============================================================================
// EMP CLOUD — Biometric Legacy Forgot-Password Email Template
//
// Ported (simplified) version of emp-monitor's biometric forgot-password
// mail. The only dynamic bits the original template actually used were the
// OTP and brand name; reseller branding + the Facebook/Twitter footer rows
// are intentionally dropped because EmpCloud doesn't model reseller
// details and the kiosk UI only reads the OTP.
// =============================================================================

import { config } from "../../config/index.js";

export function forgotPasswordBiometricEmail(params: {
  otp: number | string;
  brandName?: string;
  supportEmail?: string;
}): string {
  const brand = params.brandName || "EMP Cloud";
  const support = params.supportEmail || "support@empcloud.com";
  const otp = String(params.otp);
  const logo = `${config.baseUrl.replace(/\/+$/, "")}/static/empcloud.png`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(brand)} Biometric Password Reset</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f8;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
<tr><td align="center" style="padding:28px 32px;border-bottom:1px solid #e5e7eb;text-align:center;">
<img src="${escape(logo)}" alt="${escape(brand)}" width="160" style="display:block;margin:0 auto;max-width:160px;height:auto;border:0;outline:none;text-decoration:none;">
</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:22px;color:#111827;">Biometric password reset</h1>
<p style="margin:0 0 12px;line-height:1.6;">Use the one-time code below to reset your biometric secret key. The code is valid for 30 minutes.</p>
<div style="margin:24px 0;padding:16px 24px;background:#f3f4f6;border-radius:8px;text-align:center;font-size:28px;font-weight:700;letter-spacing:6px;color:#111827;">${escape(otp)}</div>
<p style="margin:0 0 12px;line-height:1.6;color:#6b7280;font-size:13px;">If you didn't request this, you can safely ignore this email — your secret key won't change.</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;font-size:12px;text-align:center;">
Need help? Contact <a href="mailto:${escape(support)}" style="color:#2563eb;">${escape(support)}</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
