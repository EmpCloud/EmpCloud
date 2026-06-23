// =============================================================================
// EMP CLOUD — Chat feature gate
// Restricts the employee-chat feature to an allowlist of organization ids
// (config.chat.enabledOrgIds, from CHAT_ENABLED_ORGS). Used to pilot chat with
// specific orgs before a general rollout. An empty allowlist => enabled for all.
// =============================================================================

import { Request, Response, NextFunction } from "express";
import { config } from "../../config/index.js";
import { sendError } from "../../utils/response.js";

/** Single source of truth: is chat enabled for this org? */
export function isChatEnabledForOrg(orgId: number | undefined | null): boolean {
  // CHAT_ENABLED_ORGS=all → enabled for every org (explicit opt-in).
  if (config.chat.enableForAllOrgs) return true;
  // Otherwise only the allowlisted org ids. An empty/unset allowlist means
  // chat is OFF for everyone (fail closed) — a missing env var can't silently
  // enable chat org-wide.
  return orgId != null && config.chat.enabledOrgIds.includes(orgId);
}

/**
 * Express middleware — must run after authenticate. Rejects chat API requests
 * from orgs that aren't on the allowlist.
 */
export function requireChatEnabled(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    sendError(res, 401, "UNAUTHORIZED", "Authentication required");
    return;
  }
  if (!isChatEnabledForOrg(req.user.org_id)) {
    sendError(res, 403, "CHAT_DISABLED", "Chat is not enabled for your organization.");
    return;
  }
  next();
}
