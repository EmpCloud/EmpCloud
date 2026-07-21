import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import { createAssistantContext } from "./scope-resolver.js";
import { runAssistantAgent } from "./agent.service.js";
import type { AccessTokenPayload } from "@empcloud/shared";

function ownerScope(user: AccessTokenPayload) {
  return { organization_id: user.org_id, user_id: user.sub };
}

export async function listAssistantConversations(user: AccessTokenPayload) {
  const conversations = await getDB()("assistant_conversations as c")
    .where({ "c.organization_id": user.org_id, "c.user_id": user.sub })
    .whereNull("c.archived_at")
    .orderBy("c.updated_at", "desc")
    .limit(100)
    .select("c.id", "c.title", "c.created_at", "c.updated_at")
    .select(getDB().raw("(SELECT COUNT(*) FROM assistant_messages m WHERE m.organization_id = c.organization_id AND m.conversation_id = c.id) AS message_count"));
  return conversations.map((row: any) => ({ ...row, id: Number(row.id), message_count: Number(row.message_count || 0) }));
}

export async function getAssistantConversation(user: AccessTokenPayload, conversationId: number) {
  const db = getDB();
  const conversation = await db("assistant_conversations")
    .where({ id: conversationId, ...ownerScope(user) })
    .whereNull("archived_at")
    .first("id", "title", "created_at", "updated_at");
  if (!conversation) throw new NotFoundError("Assistant conversation");
  const messages = await db("assistant_messages")
    .where({ organization_id: user.org_id, conversation_id: conversationId })
    .orderBy("id", "asc")
    .select("id", "role", "content", "tools_used", "created_at");
  return {
    ...conversation,
    id: Number(conversation.id),
    messages: messages.map((row: any) => ({ ...row, id: Number(row.id) })),
  };
}

export async function renameAssistantConversation(user: AccessTokenPayload, conversationId: number, title: string) {
  const db = getDB();
  const updated = await db("assistant_conversations")
    .where({ id: conversationId, ...ownerScope(user) })
    .whereNull("archived_at")
    .update({ title: title.trim(), updated_at: new Date() });
  if (!updated) throw new NotFoundError("Assistant conversation");
  return { id: conversationId, title: title.trim() };
}

export async function deleteAssistantConversation(user: AccessTokenPayload, conversationId: number) {
  const updated = await getDB()("assistant_conversations")
    .where({ id: conversationId, ...ownerScope(user) })
    .whereNull("archived_at")
    .update({ archived_at: new Date(), updated_at: new Date() });
  if (!updated) throw new NotFoundError("Assistant conversation");
  return { id: conversationId, deleted: true };
}

export async function sendAssistantMessage(
  user: AccessTokenPayload,
  input: { message: string; conversation_id?: number },
) {
  const prepared = await prepareAssistantMessage(user, input);
  try {
    const result = await runAssistantAgent(createAssistantContext(user), prepared.message, prepared.history);
    await persistAssistantResult(user, prepared.conversationId, result);
    return { conversation_id: prepared.conversationId, answer: result.answer, tools_used: result.toolsUsed };
  } catch (error) {
    await rollbackAssistantMessage(user, prepared.conversationId, prepared.userMessageId);
    throw error;
  }
}

export async function streamAssistantMessage(
  user: AccessTokenPayload,
  input: { message: string; conversation_id?: number },
  callbacks: {
    onConversation: (conversationId: number) => void;
    onStatus: (status: { tool: string; message: string }) => void;
    onDelta: (delta: string) => void;
  },
  signal?: AbortSignal,
) {
  const prepared = await prepareAssistantMessage(user, input);
  callbacks.onConversation(prepared.conversationId);
  try {
    const result = await runAssistantAgent(createAssistantContext(user), prepared.message, prepared.history, {
      signal, onStatus: callbacks.onStatus, onDelta: callbacks.onDelta,
    });
    await persistAssistantResult(user, prepared.conversationId, result);
    return { conversation_id: prepared.conversationId, answer: result.answer, tools_used: result.toolsUsed };
  } catch (error) {
    await rollbackAssistantMessage(user, prepared.conversationId, prepared.userMessageId);
    throw error;
  }
}

async function prepareAssistantMessage(
  user: AccessTokenPayload,
  input: { message: string; conversation_id?: number },
) {
  const db = getDB();
  const message = input.message.trim();
  if (!message || message.length > 4000) throw new ValidationError("Message must contain 1 to 4000 characters");

  let conversationId = input.conversation_id;
  if (conversationId) {
    const conversation = await db("assistant_conversations").where({ id: conversationId, organization_id: user.org_id, user_id: user.sub }).whereNull("archived_at").first();
    if (!conversation) throw new NotFoundError("Assistant conversation");
  } else {
    const [id] = await db("assistant_conversations").insert({
      organization_id: user.org_id,
      user_id: user.sub,
      title: message.slice(0, 120),
      created_at: new Date(), updated_at: new Date(),
    });
    conversationId = Number(id);
  }

  const rows = await db("assistant_messages")
    .where({ organization_id: user.org_id, conversation_id: conversationId })
    .orderBy("id", "desc").limit(20).select("role", "content");
  const history = rows.reverse() as Array<{ role: "user" | "assistant"; content: string }>;
  const [userMessageId] = await db("assistant_messages").insert({ organization_id: user.org_id, conversation_id: conversationId, role: "user", content: message, created_at: new Date() });

  return { conversationId, message, history, userMessageId: Number(userMessageId) };
}

async function persistAssistantResult(
  user: AccessTokenPayload,
  conversationId: number,
  result: { answer: string; toolsUsed: string[] },
) {
  const db = getDB();
  await db("assistant_messages").insert({
    organization_id: user.org_id, conversation_id: conversationId, role: "assistant",
    content: result.answer, tools_used: JSON.stringify(result.toolsUsed), created_at: new Date(),
  });
  await db("assistant_conversations").where({ id: conversationId, organization_id: user.org_id, user_id: user.sub }).update({ updated_at: new Date() });
}

async function rollbackAssistantMessage(user: AccessTokenPayload, conversationId: number, userMessageId: number) {
  await getDB()("assistant_messages").where({
    id: userMessageId, organization_id: user.org_id, conversation_id: conversationId, role: "user",
  }).delete();
}
