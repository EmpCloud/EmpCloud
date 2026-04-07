// =============================================================================
// EMP CLOUD — File Upload Middleware (Multer)
// =============================================================================

import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { Request } from "express";
import { ValidationError } from "../../utils/errors.js";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const orgId = req.user?.org_id ?? "unknown";
    const userId = req.user?.sub ?? "unknown";
    const uploadDir = path.join(
      process.cwd(),
      "uploads",
      "documents",
      String(orgId),
      String(userId),
    );
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ValidationError(
        "Invalid file type. Only PDF, JPEG, PNG, and DOCX files are allowed.",
      ),
    );
  }
}

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});