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
  const allow = config.chat.enabledOrgIds;
  // Empty/unset allowlist means chat is on for everyone.
  if (allow.length === 0) return true;
  return orgId != null && allow.includes(orgId);
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
