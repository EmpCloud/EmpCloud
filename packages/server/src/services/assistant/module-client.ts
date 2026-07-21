import { config } from "../../config/index.js";
import { AppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

function appendQuery(base: string, path: string, params: Record<string, unknown>): string {
  const url = new URL(`${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function internalGet(base: string, path: string, orgId: number, params: Record<string, unknown> = {}) {
  if (!config.assistant.internalServiceSecret) {
    throw new AppError("Internal module authentication is not configured", 503, "MODULE_AUTH_NOT_CONFIGURED");
  }
  const url = appendQuery(base, path, { ...params, organization_id: orgId });
  for (let attempt = 0; attempt <= config.assistant.moduleMaxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "x-internal-service": "empcloud-dashboard",
          "x-internal-secret": config.assistant.internalServiceSecret,
        },
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json().catch(() => null) as any;
      if (!response.ok) {
        const error = new AppError(body?.message || body?.error?.message || `Module returned ${response.status}`, response.status, "MODULE_REQUEST_FAILED");
        if (![408, 409, 429].includes(response.status) && response.status < 500) throw error;
        throw error;
      }
      return body?.data ?? body;
    } catch (error) {
      const status = error instanceof AppError ? error.statusCode : undefined;
      const retryable = status === undefined || status === 408 || status === 409 || status === 429 || status >= 500;
      const exhausted = attempt >= config.assistant.moduleMaxRetries;
      logger.warn("Assistant module request failed", {
        module_origin: new URL(url).origin,
        status,
        attempt: attempt + 1,
        max_attempts: config.assistant.moduleMaxRetries + 1,
        will_retry: retryable && !exhausted,
      });
      if (!retryable && error instanceof AppError) throw error;
      if (exhausted) {
        if (error instanceof AppError) throw error;
        throw new AppError("The connected HR module is temporarily unavailable. Please try again shortly.", 503, "MODULE_UNAVAILABLE");
      }
      await new Promise((resolve) => setTimeout(resolve, config.assistant.moduleRetryBaseMs * (2 ** attempt)));
    }
  }
  throw new AppError("The connected HR module is temporarily unavailable. Please try again shortly.", 503, "MODULE_UNAVAILABLE");
}

export const payrollGet = (orgId: number, path: string, params?: Record<string, unknown>) =>
  internalGet(withApiPath(config.assistant.payrollUrl, "/api/v1"), path, orgId, params);

export const monitorGet = (orgId: number, path: string, params?: Record<string, unknown>) =>
  internalGet(withApiPath(config.assistant.monitorUrl, "/api/v3"), path, orgId, params);

function withApiPath(base: string, apiPath: string): string {
  const clean = base.replace(/\/+$/, "");
  return clean.endsWith(apiPath) ? clean : `${clean}${apiPath}`;
}
