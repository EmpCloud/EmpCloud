// =============================================================================
// EMP CLOUD — Auth Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { register, login, changePassword, forgotPassword, resetPassword } from "../../services/auth/auth.service.js";
import { logAudit } from "../../services/audit/audit.service.js";
import { sendSuccess } from "../../utils/response.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  AuditAction,
} from "@empcloud/shared";

const router = Router();

// Rate limits — fully disabled when RATE_LIMIT_DISABLED=true
const disabled = process.env.RATE_LIMIT_DISABLED === "true";
const noop = (_req: any, _res: any, next: any) => next();

const registerLimiter = disabled ? noop : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_REGISTER_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMIT", message: "Too many registration attempts. Please try again later." } },
});

const loginLimiter = disabled ? noop : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "TOO_MANY_REQUESTS", message: "Too many login attempts. Please try again later." } },
});

// POST /api/v1/auth/register
router.post("/register", registerLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await register({
      orgName: data.org_name,
      orgLegalName: data.org_legal_name,
      orgCountry: data.org_country,
      orgState: data.org_state,
      orgTimezone: data.org_timezone,
      orgEmail: data.org_email,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      password: data.password,
    });

    await logAudit({
      organizationId: (result.org as any).id,
      userId: (result.user as any).id,
      action: AuditAction.REGISTER,
      resourceType: "organization",
      resourceId: String((result.org as any).id),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login
router.post("/login", loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await login(data);

    await logAudit({
      organizationId: (result.org as any).id,
      userId: (result.user as any).id,
      action: AuditAction.LOGIN,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, result);
  } catch (err: any) {
    if (err.statusCode === 401) {
      await logAudit({
        action: AuditAction.LOGIN_FAILED,
        details: { email: req.body?.email },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
    }
    next(err);
  }
});

// POST /api/v1/auth/change-password
router.post("/change-password", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = changePasswordSchema.parse(req.body);
    await changePassword({
      userId: req.user!.sub,
      currentPassword: data.current_password,
      newPassword: data.new_password,
    });

    await logAudit({
      organizationId: req.user!.org_id,
      userId: req.user!.sub,
      action: AuditAction.PASSWORD_CHANGE,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, { message: "Password changed successfully" });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/forgot-password
router.post("/forgot-password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = forgotPasswordSchema.parse(req.body);
    await forgotPassword(data.email);
    // Always return success to avoid email enumeration
    sendSuccess(res, { message: "If the email exists, a reset link has been sent" });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/reset-password
router.post("/reset-password", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = resetPasswordSchema.parse(req.body);
    await resetPassword({ token: data.token, newPassword: data.password });

    await logAudit({
      action: AuditAction.PASSWORD_RESET,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    sendSuccess(res, { message: "Password reset successfully" });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/sso/validate — Validate an SSO/JWT token (#750)
router.post("/sso/validate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) {
      sendSuccess(res, { valid: false, error: "Token is required" }, 400);
      return;
    }
    const { verifyAccessToken } = await import("../../services/oauth/jwt.service.js");
    const payload = verifyAccessToken(token);
    sendSuccess(res, { valid: true, user: payload });
  } catch (err: any) {
    sendSuccess(res, { valid: false, error: err.message || "Invalid token" });
  }
});

// POST /api/v1/auth/sso/token — Generate SSO token for module access (#750)
router.post("/sso/token", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module_id } = req.body;
    const { signAccessToken } = await import("../../services/oauth/jwt.service.js");
    const ssoToken = signAccessToken({
      sub: req.user!.sub,
      email: req.user!.email,
      first_name: req.user!.first_name,
      last_name: req.user!.last_name,
      role: req.user!.role,
      org_id: req.user!.org_id,
      org_name: req.user!.org_name,
    });
    sendSuccess(res, { token: ssoToken, module_id });
  } catch (err) {
    next(err);
  }
});

export default router;
