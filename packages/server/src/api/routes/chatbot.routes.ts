// =============================================================================
// EMP CLOUD — Chatbot Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import * as chatbotService from "../../services/chatbot/chatbot.service.js";
import { paramInt } from "../../utils/params.js";

const router = Router();

// POST /api/v1/chatbot/conversations — Start new conversation
router.post(
  "/conversations",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const convo = await chatbotService.createConversation(req.user!.org_id, req.user!.sub);
      sendSuccess(res, convo, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/chatbot/conversations — List my conversations
router.get(
  "/conversations",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conversations = await chatbotService.getConversations(req.user!.org_id, req.user!.sub);
      sendSuccess(res, conversations);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/chatbot/conversations/:id — Get conversation messages
router.get(
  "/conversations/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const messages = await chatbotService.getMessages(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub
      );
      sendSuccess(res, messages);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/chatbot/conversations/:id/send — Send message + get response
router.post(
  "/conversations/:id/send",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message, language } = req.body;
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        sendSuccess(res, { error: "Message is required" }, 400);
        return;
      }

      const result = await chatbotService.sendMessage(
        req.user!.org_id,
        req.user!.sub,
        paramInt(req.params.id),
        message.trim(),
        typeof language === "string" ? language : "en"
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/chatbot/conversations/:id — Archive conversation
router.delete(
  "/conversations/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await chatbotService.deleteConversation(req.user!.org_id, paramInt(req.params.id), req.user!.sub);
      sendSuccess(res, { message: "Conversation archived" });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/chatbot/suggestions — Get suggested questions
router.get(
  "/suggestions",
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const suggestions = chatbotService.getSuggestions();
      sendSuccess(res, suggestions);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/chatbot/ai-status — Check if AI engine is active
router.get(
  "/ai-status",
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = chatbotService.getAIStatus();
      sendSuccess(res, status);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
