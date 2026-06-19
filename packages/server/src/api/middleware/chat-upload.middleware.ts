// =============================================================================
// EMP CLOUD — Chat Attachment Upload Middleware (Multer)
// =============================================================================
//
// Stores chat attachments on disk under
//   uploads/chat/{orgId}/{conversationId}/{timestamp}-{rand}{ext}
// mirroring the document/photo upload conventions. Only the relative path is
// persisted; files are served back through an authenticated route, never via a
// static path, so tenant isolation holds.

import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { Request } from "express";
import { ValidationError } from "../../utils/errors.js";

// Photos + the common office/document file types people share in chat.
const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  // Documents
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-powerpoint", // .ppt
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  // Archives
  "application/zip",
  "application/x-zip-compressed",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const orgId = req.user?.org_id ?? "unknown";
    // :id is the conversation id on the upload route.
    const conversationId = req.params?.id ?? "misc";
    const uploadDir = path.join(
      process.cwd(),
      "uploads",
      "chat",
      String(orgId),
      String(conversationId),
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
        "Unsupported file type. You can share images, PDFs, Office documents, text files and zip archives.",
      ),
    );
  }
}

export const chatUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});
