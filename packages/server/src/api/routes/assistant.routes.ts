import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import { AppError, ValidationError } from "../../utils/errors.js";
import {
  deleteAssistantConversation,
  getAssistantConversation,
  listAssistantConversations,
  renameAssistantConversation,
  sendAssistantMessage,
  streamAssistantMessage,
} from "../../services/assistant/assistant.service.js";

const router = Router();
const requestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversation_id: z.number().int().positive().optional(),
}).strict();
const conversationIdSchema = z.coerce.number().int().positive();
const renameSchema = z.object({ title: z.string().trim().min(1).max(255) }).strict();

router.use(authenticate, requirePermission("assistant:use"));

router.get("/conversations", async (req: Request, res: Response, next: NextFunction) => {
  try { sendSuccess(res, await listAssistantConversations(req.user!)); } catch (error) { next(error); }
});

router.get("/conversations/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = conversationIdSchema.safeParse(req.params.id);
    if (!id.success) throw new ValidationError("Invalid conversation id");
    sendSuccess(res, await getAssistantConversation(req.user!, id.data));
  } catch (error) { next(error); }
});

router.patch("/conversations/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = conversationIdSchema.safeParse(req.params.id);
    const body = renameSchema.safeParse(req.body);
    if (!id.success || !body.success) throw new ValidationError("Invalid conversation rename request");
    sendSuccess(res, await renameAssistantConversation(req.user!, id.data, body.data.title));
  } catch (error) { next(error); }
});

router.delete("/conversations/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = conversationIdSchema.safeParse(req.params.id);
    if (!id.success) throw new ValidationError("Invalid conversation id");
    sendSuccess(res, await deleteAssistantConversation(req.user!, id.data));
  } catch (error) { next(error); }
});

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError("Invalid assistant request", parsed.error.flatten());
    sendSuccess(res, await sendAssistantMessage(req.user!, parsed.data));
  } catch (error) { next(error); }
});

router.post("/stream", async (req: Request, res: Response, next: NextFunction) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return next(new ValidationError("Invalid assistant request", parsed.error.flatten()));

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const abortController = new AbortController();
  req.on("aborted", () => abortController.abort());
  res.on("close", () => { if (!res.writableEnded) abortController.abort(); });
  const emit = (event: string, data: unknown) => {
    if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const keepAlive = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(": keep-alive\n\n");
  }, 15_000);

  try {
    const result = await streamAssistantMessage(req.user!, parsed.data, {
      onConversation: (conversationId) => emit("conversation", { conversation_id: conversationId }),
      onStatus: (status) => emit("status", status),
      onDelta: (delta) => emit("delta", { text: delta }),
    }, abortController.signal);
    emit("done", { conversation_id: result.conversation_id, tools_used: result.tools_used });
  } catch (error) {
    if (!abortController.signal.aborted) {
      const appError = error instanceof AppError ? error : undefined;
      emit("error", {
        code: appError?.code || "ASSISTANT_STREAM_FAILED",
        message: appError?.message || "The assistant could not complete this response. Please try again.",
      });
    }
  } finally {
    clearInterval(keepAlive);
    if (!res.writableEnded) res.end();
  }
});

export default router;
