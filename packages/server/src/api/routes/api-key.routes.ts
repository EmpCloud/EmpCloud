// =============================================================================
// EMP CLOUD — API Key Routes
//
// Org-admin self-service management of programmatic API keys. The keys minted
// here authenticate against EmpCloud APIs and any module that reads the
// EmpCloud master DB (emp-payroll). A key mirrors the creating admin's RBAC.
//
// Gated by requireOrgAdmin (org_admin / hr_admin / super_admin) — the same
// "org admin" bar the user asked for. A key can never out-scope the admin who
// created it because permissions are resolved live from that user on each call.
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireOrgAdmin } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "../../services/auth/api-key.service.js";

const router = Router();

// Every route here requires an authenticated org admin.
router.use(authenticate, requireOrgAdmin);

// GET /api/v1/api-keys — list this org's keys (metadata only, never the secret)
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keys = await listApiKeys(req.user!.org_id);
    sendSuccess(res, keys);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/api-keys — create a key. Returns the raw secret ONCE.
// Body: { name: string, expiresInDays?: number }
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      sendError(res, 400, "VALIDATION_ERROR", "A key name is required");
      return;
    }
    const rawDays = req.body?.expiresInDays;
    const expiresInDays =
      rawDays === undefined || rawDays === null || rawDays === ""
        ? null
        : Number(rawDays);
    if (expiresInDays !== null && (!Number.isFinite(expiresInDays) || expiresInDays < 0)) {
      sendError(res, 400, "VALIDATION_ERROR", "expiresInDays must be a positive number of days");
      return;
    }

    const { apiKey, rawKey } = await createApiKey({
      orgId: req.user!.org_id,
      userId: req.user!.sub,
      name,
      expiresInDays,
    });

    // `key` is the only time the raw secret is exposed — the client must copy
    // it now; it is never retrievable again.
    sendSuccess(res, { ...apiKey, key: rawKey }, 201);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/api-keys/:id — revoke a key
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid key id");
      return;
    }
    const ok = await revokeApiKey(req.user!.org_id, id);
    if (!ok) {
      sendError(res, 404, "NOT_FOUND", "API key not found or already revoked");
      return;
    }
    sendSuccess(res, { id, revoked: true });
  } catch (err) {
    next(err);
  }
});

export default router;
