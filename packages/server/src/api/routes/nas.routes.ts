// =============================================================================
// EMP CLOUD — NAS REST module
//
// Ports emp-monitor's /api/v3/nas/* file storage surface to EmpCloud so
// existing kiosk/device firmware can swap the base URL without refactoring.
// Endpoints:
//   POST   /                ping
//   GET    /fetch-image     public — streams a NAS file by relative path
//   POST   /upload-image    secretKey + multer single "image"
//   DELETE /delete-image    secretKey — delete by {email, image}
//   PUT    /update-image    secretKey + multer — replace {oldImageUrl}
//   POST   /list-images     secretKey — list files under <project>/<email>
//
// Auth model: write/list endpoints require a body secretKey that matches
// NAS_SECRET_KEY env var. This mirrors emp-monitor's auth.middleware.js
// behaviour — its `authenticate` function has an explicit bypass rule for
// these four NAS paths when `secretKey === process.env.NAS_SECRET_KEY`, so
// in practice no user JWT is involved. Fail-closed if env var is unset.
//
// Shared bits (SFTP session, upload helper, etc.) live in
// ../../services/nas/nas.service.ts. Validation schemas live alongside it in
// ../../services/nas/nas.validation.ts.
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { ZodError } from "zod";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import * as nas from "../../services/nas/nas.service.js";
import {
  fetchImageQuerySchema,
  uploadBodySchema,
  deleteBodySchema,
  updateBodySchema,
  listBodySchema,
} from "../../services/nas/nas.validation.js";

const router = Router();

const upload = multer({ storage: multer.memoryStorage() }).single("image");

// Preserve emp-monitor's response envelope on this module: the JS version
// returns `{ data, error, message }` without a `code` field. Matching that
// byte-for-byte so any existing client keeps parsing the body cleanly.
function ok(res: Response, data: unknown, message = "success") {
  return res.status(200).json({ data, error: null, message });
}

function bad(res: Response, status: number, message: string) {
  return res.status(status).json({ data: null, error: null, message });
}

function validationFail(res: Response, err: unknown) {
  const msg =
    err instanceof ZodError
      ? err.errors[0]?.message || "Validation Failed"
      : "Validation Failed";
  return bad(res, 400, msg);
}

// Shared-secret gate for NAS write/list endpoints. Mirrors emp-monitor's
// auth.middleware.js bypass rule — a matching `secretKey` in the body
// authorizes the request, no JWT required. Expected value is
// `config.nas.secretKey` (env: NAS_SECRET_KEY). Fail-closed if the server
// has no secret configured — refuses service rather than silently allowing
// clients that send an empty secret to pass. Uses constant-time compare to
// avoid leaking the secret via response-time side channels.
function requireNasSecretKey(req: Request, res: Response, next: NextFunction) {
  const expected = config.nas.secretKey;
  if (!expected) {
    logger.error("NAS_SECRET_KEY not configured — rejecting request");
    return bad(res, 503, "NAS secretKey not configured on server");
  }
  const provided = (req.body?.secretKey ?? "").toString();
  if (!provided) return bad(res, 401, "secretKey required");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return bad(res, 401, "Invalid secretKey");
  }
  return next();
}

function baseApiUrl(): string {
  // Match emp-monitor's URL construction — kiosks expect /api/v3 on the
  // serving host. Fall back to config.baseUrl since EmpCloud already models
  // a single canonical external URL.
  return `${config.baseUrl.replace(/\/+$/, "")}/api/v3`;
}

function buildFetchUrl(filePath: string): string {
  return `${baseApiUrl()}/nas/fetch-image?url=${encodeURIComponent(filePath)}`;
}

// POST / — ping, matches emp-monitor's liveness endpoint
router.post("/", (_req: Request, res: Response) => ok(res, null));

// GET /fetch-image?url=<relativePath> — public, streams the file
router.get("/fetch-image", async (req: Request, res: Response) => {
  const parsed = fetchImageQuerySchema.safeParse(req.query);
  if (!parsed.success) return validationFail(res, parsed.error);
  try {
    await nas.streamFile(parsed.data.url, res);
  } catch (err) {
    logger.error("NAS fetch-image failed", { err: (err as Error)?.message });
    if (!res.headersSent) res.status(500).json({ error: "Fetch failed", details: (err as Error)?.message });
  }
});

// POST /upload-image — secretKey + multer, body {email, secretKey}, file "image".
// emp-monitor's `authenticate` middleware bypasses JWT for NAS paths when the
// body secretKey matches NAS_SECRET_KEY; requireNasSecretKey does exactly that.
router.post(
  "/upload-image",
  (req, res, next) => upload(req, res, (err) => (err ? next(err) : next())),
  requireNasSecretKey,
  async (req: Request, res: Response) => {
    const parsed = uploadBodySchema.safeParse(req.body);
    if (!parsed.success) return validationFail(res, parsed.error);
    if (!req.file) return res.status(400).json({ error: "Missing image file" });
    try {
      const { email } = parsed.data;
      const projectName = config.nas.projectName;
      const filename = req.file.originalname.replace(/ /g, "_");
      await nas.uploadBuffer(req.file.buffer, filename, { email, projectName });
      const filePath = `${projectName}/${email}/${filename}`;
      return ok(res, { url: buildFetchUrl(filePath) });
    } catch (err) {
      return res.status(500).json({ error: "Upload failed", details: (err as Error)?.message });
    }
  },
);

// DELETE /delete-image — secretKey, body {email, image, secretKey}
router.delete("/delete-image", requireNasSecretKey, async (req: Request, res: Response) => {
  const parsed = deleteBodySchema.safeParse(req.body);
  if (!parsed.success) return validationFail(res, parsed.error);
  try {
    const { email, image } = parsed.data;
    const projectName = config.nas.projectName;
    const filePath = `${projectName}/${email}/${image}`;
    const deleted = await nas.deleteFile(filePath);
    if (!deleted) return bad(res, 404, "File does not exist.");
    return ok(res, null, "file deleted successfully");
  } catch (err) {
    return res.status(500).json({ error: "Deletion failed", details: (err as Error)?.message });
  }
});

// PUT /update-image — secretKey + multer, body {oldImageUrl, email, secretKey}, file "image"
router.put(
  "/update-image",
  (req, res, next) => upload(req, res, (err) => (err ? next(err) : next())),
  requireNasSecretKey,
  async (req: Request, res: Response) => {
    const parsed = updateBodySchema.safeParse(req.body);
    if (!parsed.success) return validationFail(res, parsed.error);
    if (!req.file) return res.status(400).json({ error: "Missing new image file" });
    try {
      const { oldImageUrl, email } = parsed.data;
      const projectName = config.nas.projectName;
      const oldFilePath = `${projectName}/${email}/${oldImageUrl}`;
      const deleted = await nas.deleteFile(oldFilePath);
      if (!deleted) return res.status(400).json({ error: "Deletion failed" });
      const filename = req.file.originalname.replace(/ /g, "_");
      await nas.uploadBuffer(req.file.buffer, filename, { email, projectName });
      const newFilePath = `${projectName}/${email}/${filename}`;
      return ok(res, { url: buildFetchUrl(newFilePath) }, "Image updated successfully");
    } catch (err) {
      return res.status(500).json({ error: "Update failed", details: (err as Error)?.message });
    }
  },
);

// POST /list-images — secretKey, body {email, secretKey}
router.post("/list-images", requireNasSecretKey, async (req: Request, res: Response) => {
  const parsed = listBodySchema.safeParse(req.body);
  if (!parsed.success) return validationFail(res, parsed.error);
  try {
    const { email } = parsed.data;
    const projectName = config.nas.projectName;
    const dirpath = `/${projectName}/${email}`;
    const files = await nas.listFiles(dirpath);
    const urls = files
      .filter((f) => f.type === "-")
      .map((f) => buildFetchUrl(`${projectName}/${email}/${f.name}`));
    return ok(res, urls);
  } catch (err) {
    return res.status(500).json({ error: "Listing failed", details: (err as Error)?.message });
  }
});

export default router;
