// =============================================================================
// EMP CLOUD — Employee Chat / Private Messaging Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import path from "node:path";
import fs from "node:fs";
import { authenticate } from "../middleware/auth.middleware.js";
import { chatUpload } from "../middleware/chat-upload.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import { NotFoundError } from "../../utils/errors.js";
import * as chatService from "../../services/chat/chat.service.js";
import {
  startDirectConversationSchema,
  createGroupConversationSchema,
  addMembersSchema,
  renameGroupSchema,
  muteConversationSchema,
  pinMessageSchema,
  archiveConversationSchema,
  groupDescriptionSchema,
  chatStatusSchema,
  sendMessageSchema,
  sendMessageWithAttachmentSchema,
  editMessageSchema,
  toggleReactionSchema,
  forwardMessageSchema,
  markReadSchema,
  markDeliveredSchema,
  tickResyncSchema,
  messageQuerySchema,
  messageSearchSchema,
} from "@empcloud/shared";
import { paramInt } from "../../utils/params.js";
import * as chatEvents from "../../services/chat/chat-events.js";
import rateLimit from "express-rate-limit";

// ---- Chat-specific rate limits (anti-spam) ----
// Disabled entirely during active development (RATE_LIMIT_DISABLED=true) and
// keyed per-user so one noisy account can't be throttled by another's traffic.
const rlDisabled = process.env.RATE_LIMIT_DISABLED === "true";
const rlNoop = (_req: Request, _res: Response, next: NextFunction) => next();
const byUser = (req: Request) => String(req.user?.sub ?? req.ip);
// Sending messages: generous for normal chatting, blocks flood/spam.
const sendLimiter = rlDisabled
  ? rlNoop
  : rateLimit({
      windowMs: 60 * 1000,
      max: Number(process.env.RATE_LIMIT_CHAT_SEND_MAX || 60),
      keyGenerator: byUser,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: { code: "RATE_LIMIT", message: "You're sending messages too fast. Please slow down." } },
    });
// Attachment uploads: tighter (heavier on storage/bandwidth).
const uploadLimiter = rlDisabled
  ? rlNoop
  : rateLimit({
      windowMs: 60 * 1000,
      max: Number(process.env.RATE_LIMIT_CHAT_UPLOAD_MAX || 20),
      keyGenerator: byUser,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: { code: "RATE_LIMIT", message: "Too many uploads. Please wait a moment." } },
    });

const router = Router();

// Every chat route requires an authenticated user.
router.use(authenticate);

// ---- My chat profile ----

// GET /api/v1/chat/me/status — the caller's own chat status / "About"
router.get("/me/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await chatService.getMyChatStatus(req.user!.sub);
    sendSuccess(res, { status });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/chat/me/status — set the caller's chat status (blank clears it)
router.patch("/me/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = chatStatusSchema.parse(req.body);
    const saved = await chatService.setMyChatStatus(req.user!.sub, status);
    sendSuccess(res, { status: saved });
  } catch (err) {
    next(err);
  }
});

// ---- Conversations ----

// GET /api/v1/chat/conversations — list my conversations
router.get("/conversations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await chatService.listConversations(req.user!.org_id, req.user!.sub);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/chat/unread-count — total unread across conversations (nav badge)
router.get("/unread-count", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await chatService.getTotalUnread(req.user!.org_id, req.user!.sub);
    sendSuccess(res, { unread_count: count });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/chat/search?q=...&limit=... — search message bodies across my chats
router.get("/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, limit, conversation_id } = messageSearchSchema.parse(req.query);
    const results = await chatService.searchMessages(
      req.user!.org_id,
      req.user!.sub,
      q,
      limit,
      conversation_id,
    );
    sendSuccess(res, results);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/chat/conversations/direct — start/get a direct conversation
router.post("/conversations/direct", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id } = startDirectConversationSchema.parse(req.body);
    const convo = await chatService.startDirect(req.user!.org_id, req.user!.sub, user_id);
    sendSuccess(res, convo, 201);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/chat/conversations/group — create a group conversation
router.post("/conversations/group", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createGroupConversationSchema.parse(req.body);
    const convo = await chatService.createGroup(req.user!.org_id, req.user!.sub, data);
    sendSuccess(res, convo, 201);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/chat/conversations/:id — one conversation's summary
router.get("/conversations/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const convo = await chatService.getConversation(
      req.user!.org_id,
      req.user!.sub,
      paramInt(req.params.id),
    );
    sendSuccess(res, convo);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/chat/conversations/:id/members/:memberId — remove a group member
// (group creator only)
router.delete(
  "/conversations/:id/members/:memberId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const convo = await chatService.removeMember(
        req.user!.org_id,
        req.user!.sub,
        paramInt(req.params.id),
        paramInt(req.params.memberId),
      );
      sendSuccess(res, convo);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/chat/conversations/:id/members — add members to a group (creator)
router.post(
  "/conversations/:id/members",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { member_ids } = addMembersSchema.parse(req.body);
      const convId = paramInt(req.params.id);
      const convo = await chatService.addMembers(
        req.user!.org_id,
        req.user!.sub,
        convId,
        member_ids,
      );
      // Nudge the newly-added members' sidebars so the group appears for them.
      for (const id of member_ids) {
        chatEvents.emitConversationBump(req.user!.org_id, id, convId);
      }
      sendSuccess(res, convo);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/chat/conversations/:id/leave — leave a group (self-service)
router.post(
  "/conversations/:id/leave",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await chatService.leaveGroup(req.user!.org_id, req.user!.sub, paramInt(req.params.id));
      sendSuccess(res, { left: true });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/chat/conversations/:id — rename a group (creator only)
router.patch(
  "/conversations/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = renameGroupSchema.parse(req.body);
      const convId = paramInt(req.params.id);
      const convo = await chatService.renameGroup(req.user!.org_id, req.user!.sub, convId, name);
      // Refresh every member's sidebar (new title) — the participants list lives
      // on the summary, sourced from chat-conversations.
      for (const p of convo.participants) {
        chatEvents.emitConversationBump(req.user!.org_id, p.user_id, convId);
      }
      sendSuccess(res, convo);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/chat/conversations/:id/mute — mute/unmute for the caller
router.patch(
  "/conversations/:id/mute",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { muted } = muteConversationSchema.parse(req.body);
      const convId = paramInt(req.params.id);
      const convo = await chatService.setMute(req.user!.org_id, req.user!.sub, convId, muted);
      sendSuccess(res, convo);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/chat/conversations/:id/archive — archive/unarchive for the caller
router.patch(
  "/conversations/:id/archive",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { archived } = archiveConversationSchema.parse(req.body);
      const convId = paramInt(req.params.id);
      const convo = await chatService.setArchived(req.user!.org_id, req.user!.sub, convId, archived);
      sendSuccess(res, convo);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/chat/conversations/:id — delete a group (creator only)
router.delete(
  "/conversations/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const convId = paramInt(req.params.id);
      const affected = await chatService.deleteGroup(req.user!.org_id, req.user!.sub, convId);
      // Nudge every former member's sidebar so the group disappears for them too.
      for (const memberId of affected) {
        chatEvents.emitConversationBump(req.user!.org_id, memberId, convId);
      }
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---- Messages ----

// GET /api/v1/chat/conversations/:id/messages — message history
router.get(
  "/conversations/:id/messages",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { before, limit } = messageQuerySchema.parse(req.query);
      const messages = await chatService.listMessages(
        req.user!.org_id,
        req.user!.sub,
        paramInt(req.params.id),
        { before, limit },
      );
      sendSuccess(res, messages);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/chat/conversations/:id/messages — send a message
router.post(
  "/conversations/:id/messages",
  sendLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { body, client_msg_id, mentioned_user_ids, reply_to_message_id } =
        sendMessageSchema.parse(req.body);
      const message = await chatService.sendMessage(
        req.user!.org_id,
        req.user!.sub,
        paramInt(req.params.id),
        body,
        null,
        client_msg_id,
        mentioned_user_ids,
        reply_to_message_id,
      );
      // Realtime fan-out (no-op when the socket layer isn't attached).
      chatEvents.emitMessageNew(req.user!.org_id, message);
      sendSuccess(res, message, 201);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/chat/conversations/:id/messages/attachment — send a message with
// a file/photo (multipart/form-data: field "file", optional text field "body").
// Authorize BEFORE multer writes the upload to disk: a non-participant must be
// rejected without ever landing a file in the conversation's upload directory.
async function guardAttachmentParticipant(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    await chatService.assertParticipant(req.user!.org_id, req.user!.sub, paramInt(req.params.id));
    next();
  } catch (err) {
    next(err);
  }
}

router.post(
  "/conversations/:id/messages/attachment",
  uploadLimiter,
  guardAttachmentParticipant,
  chatUpload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new NotFoundError("File");
      const { body, client_msg_id, mentioned_user_ids, reply_to_message_id } =
        sendMessageWithAttachmentSchema.parse(req.body);
      // Store a relative path so the DB never holds an absolute server path.
      const relativePath = path
        .relative(process.cwd(), req.file.path)
        .split(path.sep)
        .join("/");
      const message = await chatService.sendMessage(
        req.user!.org_id,
        req.user!.sub,
        paramInt(req.params.id),
        body,
        {
          path: relativePath,
          name: req.file.originalname,
          size: req.file.size,
          mime: req.file.mimetype,
        },
        client_msg_id,
        mentioned_user_ids,
        reply_to_message_id,
      );
      chatEvents.emitMessageNew(req.user!.org_id, message);
      sendSuccess(res, message, 201);
    } catch (err) {
      // If the message couldn't be created, don't leave an orphaned file behind.
      if (req.file?.path) {
        fs.unlink(req.file.path, () => {});
      }
      next(err);
    }
  },
);

// PATCH /api/v1/chat/conversations/:id/description — set group description (admin)
router.patch(
  "/conversations/:id/description",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { description } = groupDescriptionSchema.parse(req.body);
      const convId = paramInt(req.params.id);
      const convo = await chatService.setGroupDescription(
        req.user!.org_id,
        req.user!.sub,
        convId,
        description,
      );
      for (const p of convo.participants) {
        chatEvents.emitConversationBump(req.user!.org_id, p.user_id, convId);
      }
      sendSuccess(res, convo);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/chat/conversations/:id/avatar — set group photo (admin)
router.post(
  "/conversations/:id/avatar",
  uploadLimiter,
  chatUpload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new NotFoundError("File");
      if (!req.file.mimetype.startsWith("image/")) {
        fs.unlink(req.file.path, () => {});
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Group photo must be an image" },
        });
        return;
      }
      const relativePath = path
        .relative(process.cwd(), req.file.path)
        .split(path.sep)
        .join("/");
      const convId = paramInt(req.params.id);
      const convo = await chatService.setGroupAvatar(
        req.user!.org_id,
        req.user!.sub,
        convId,
        relativePath,
      );
      for (const p of convo.participants) {
        chatEvents.emitConversationBump(req.user!.org_id, p.user_id, convId);
      }
      sendSuccess(res, convo);
    } catch (err) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      next(err);
    }
  },
);

// GET /api/v1/chat/conversations/:id/avatar — stream the group photo
router.get(
  "/conversations/:id/avatar",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rel = await chatService.getGroupAvatarPath(
        req.user!.org_id,
        req.user!.sub,
        paramInt(req.params.id),
      );
      if (!rel) throw new NotFoundError("Avatar");
      const absolutePath = path.resolve(rel);
      const uploadsBase = path.resolve(process.cwd(), "uploads");
      if (!absolutePath.startsWith(uploadsBase) || rel.includes("..")) {
        res
          .status(403)
          .json({ success: false, error: { code: "FORBIDDEN", message: "Invalid file path" } });
        return;
      }
      if (!fs.existsSync(absolutePath)) throw new NotFoundError("Avatar");
      res.sendFile(absolutePath);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/chat/conversations/:id/messages/:messageId/attachment — stream the
// attached file (inline so images/PDFs preview in the browser).
router.get(
  "/conversations/:id/messages/:messageId/attachment",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const att = await chatService.getAttachment(
        req.user!.org_id,
        req.user!.sub,
        paramInt(req.params.id),
        paramInt(req.params.messageId),
      );
      const absolutePath = path.resolve(att.path);
      // Path-traversal guard: the resolved path must stay under uploads/.
      const uploadsBase = path.resolve(process.cwd(), "uploads");
      if (!absolutePath.startsWith(uploadsBase) || att.path.includes("..")) {
        res
          .status(403)
          .json({ success: false, error: { code: "FORBIDDEN", message: "Invalid file path" } });
        return;
      }
      if (!fs.existsSync(absolutePath)) throw new NotFoundError("Attachment");
      res.setHeader("Content-Type", att.mime);
      // inline → images/PDFs preview; browsers still let users save the file.
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(att.name)}"`,
      );
      res.sendFile(absolutePath);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/chat/conversations/:id/messages/:messageId — edit own message
router.patch(
  "/conversations/:id/messages/:messageId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { body, mentioned_user_ids } = editMessageSchema.parse(req.body);
      const convId = paramInt(req.params.id);
      const message = await chatService.editMessage(
        req.user!.org_id,
        req.user!.sub,
        convId,
        paramInt(req.params.messageId),
        body,
        mentioned_user_ids,
      );
      chatEvents.emitMessageUpdate(req.user!.org_id, convId, message);
      sendSuccess(res, message);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/chat/conversations/:id/messages/:messageId — soft-delete own message
router.delete(
  "/conversations/:id/messages/:messageId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const convId = paramInt(req.params.id);
      const message = await chatService.deleteMessage(
        req.user!.org_id,
        req.user!.sub,
        convId,
        paramInt(req.params.messageId),
      );
      chatEvents.emitMessageUpdate(req.user!.org_id, convId, message);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/chat/conversations/:id/messages/:messageId/reactions — toggle emoji
router.post(
  "/conversations/:id/messages/:messageId/reactions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { emoji } = toggleReactionSchema.parse(req.body);
      const convId = paramInt(req.params.id);
      const messageId = paramInt(req.params.messageId);
      const result = await chatService.toggleReaction(
        req.user!.org_id,
        req.user!.sub,
        convId,
        messageId,
        emoji,
      );
      // Push fresh per-recipient reactions to everyone in the conversation.
      await chatEvents.emitReactionUpdate(req.user!.org_id, convId, messageId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/chat/conversations/:id/pinned — pinned messages (for the pin bar)
router.get(
  "/conversations/:id/pinned",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pinned = await chatService.getPinnedMessages(
        req.user!.org_id,
        req.user!.sub,
        paramInt(req.params.id),
      );
      sendSuccess(res, pinned);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/chat/conversations/:id/messages/:messageId/pin — pin/unpin
router.post(
  "/conversations/:id/messages/:messageId/pin",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pinned } = pinMessageSchema.parse(req.body);
      const convId = paramInt(req.params.id);
      const messageId = paramInt(req.params.messageId);
      await chatService.setPinned(req.user!.org_id, req.user!.sub, convId, messageId, pinned);
      sendSuccess(res, { pinned });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/chat/conversations/:id/forward — forward one or more messages
// from this conversation into one or more target conversations
router.post(
  "/conversations/:id/forward",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message_ids, target_conversation_ids } = forwardMessageSchema.parse(req.body);
      const created = await chatService.forwardMessage(
        req.user!.org_id,
        req.user!.sub,
        paramInt(req.params.id),
        message_ids,
        target_conversation_ids,
      );
      // Fan each forwarded copy out to its target conversation.
      for (const message of created) {
        chatEvents.emitMessageNew(req.user!.org_id, message);
      }
      sendSuccess(
        res,
        {
          forwarded: created.length,
          conversations: [...new Set(created.map((m) => m.conversation_id))],
        },
        201,
      );
    } catch (err) {
      next(err);
    }
  },
);

// ---- Delivery / read state ----

// POST /api/v1/chat/conversations/:id/read — mark read up to a message id
router.post("/conversations/:id/read", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { last_read_message_id } = markReadSchema.parse(req.body);
    const convId = paramInt(req.params.id);
    await chatService.markRead(
      req.user!.org_id,
      req.user!.sub,
      convId,
      last_read_message_id,
    );
    // Tell senders their messages were read (no-op when socket isn't attached).
    await chatEvents.emitTickUpdate(req.user!.org_id, convId, req.user!.sub);
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/chat/conversations/:id/delivered — mark delivered up to a message id
router.post(
  "/conversations/:id/delivered",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { up_to_message_id } = markDeliveredSchema.parse(req.body);
      const convId = paramInt(req.params.id);
      await chatService.markDelivered(req.user!.org_id, req.user!.sub, convId, up_to_message_id);
      await chatEvents.emitTickUpdate(req.user!.org_id, convId, req.user!.sub);
      sendSuccess(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/chat/conversations/:id/ticks?since_message_id=N — resync ticks
router.get("/conversations/:id/ticks", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { since_message_id } = tickResyncSchema.parse(req.query);
    const ticks = await chatService.getTicksSince(
      req.user!.org_id,
      req.user!.sub,
      paramInt(req.params.id),
      since_message_id,
    );
    sendSuccess(res, ticks);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/chat/conversations/:id/messages/:messageId/receipts — per-name
// "Read by / Delivered to / Pending" breakdown for the caller's own message.
router.get(
  "/conversations/:id/messages/:messageId/receipts",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const breakdown = await chatService.getMessageReceipts(
        req.user!.org_id,
        req.user!.sub,
        paramInt(req.params.id),
        paramInt(req.params.messageId),
      );
      sendSuccess(res, breakdown);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
