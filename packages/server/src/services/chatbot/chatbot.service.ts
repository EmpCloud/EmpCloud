// =============================================================================
// EMP CLOUD — AI HR Chatbot Service
// Rule-based intent matching with real database lookups.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { runAgent, detectProvider, detectProviderAsync, type AIProvider } from "./agent.service.js";

// ---------------------------------------------------------------------------
// Intent definitions
// ---------------------------------------------------------------------------

interface Intent {
  name: string;
  keywords: string[];
  handler: (orgId: number, userId: number, message: string) => Promise<ChatResponse>;
}

interface ChatResponse {
  content: string;
  metadata?: Record<string, unknown>;
}

const INTENTS: Intent[] = [
  {
    name: "leave_balance",
    keywords: ["leave balance", "how many leaves", "remaining leave", "pto", "leave left", "my leaves"],
    handler: handleLeaveBalance,
  },
  {
    name: "apply_leave",
    keywords: ["apply leave", "request leave", "take leave", "day off", "time off", "apply for leave"],
    handler: handleApplyLeave,
  },
  {
    name: "attendance",
    keywords: ["attendance", "check in", "checked in today", "my attendance", "punch in", "clock in", "today attendance"],
    handler: handleAttendance,
  },
  {
    name: "policy",
    keywords: ["policy", "policies", "company policy", "rules", "guidelines", "handbook"],
    handler: handlePolicy,
  },
  {
    name: "helpdesk",
    keywords: ["help", "issue", "problem", "ticket", "support", "raise ticket", "create ticket"],
    handler: handleHelpdesk,
  },
  {
    name: "payslip",
    keywords: ["payslip", "salary", "pay", "compensation", "paycheck", "wage"],
    handler: handlePayslip,
  },
  {
    name: "holiday",
    keywords: ["holiday", "holidays", "next holiday", "vacation", "public holiday", "upcoming holiday"],
    handler: handleHoliday,
  },
  {
    name: "who_is",
    keywords: ["who is", "contact", "email of", "phone of", "find employee", "employee details"],
    handler: handleWhoIs,
  },
  {
    name: "announcement",
    keywords: ["announcement", "news", "latest update", "announcements", "company news", "what's new"],
    handler: handleAnnouncement,
  },
  {
    name: "greeting",
    keywords: ["hi", "hello", "hey", "good morning", "good afternoon", "good evening", "howdy"],
    handler: handleGreeting,
  },
];

// ---------------------------------------------------------------------------
// Intent Matching
// ---------------------------------------------------------------------------

function detectIntent(message: string): Intent | null {
  const lower = message.toLowerCase().trim();

  // Score each intent — longer keyword matches rank higher
  let bestIntent: Intent | null = null;
  let bestScore = 0;

  for (const intent of INTENTS) {
    for (const keyword of intent.keywords) {
      if (lower.includes(keyword)) {
        const score = keyword.length;
        if (score > bestScore) {
          bestScore = score;
          bestIntent = intent;
        }
      }
    }
  }

  return bestIntent;
}

// ---------------------------------------------------------------------------
// Intent Handlers — Real DB Queries
// ---------------------------------------------------------------------------

async function handleLeaveBalance(orgId: number, userId: number): Promise<ChatResponse> {
  const db = getDB();

  const balances = await db("leave_balances as lb")
    .join("leave_types as lt", function () {
      this.on("lt.id", "=", "lb.leave_type_id")
        .andOn("lt.organization_id", "=", "lb.organization_id");
    })
    .where({ "lb.organization_id": orgId, "lb.user_id": userId })
    .select(
      "lt.name as leave_type",
      "lb.total_allocated",
      "lb.total_used",
      "lb.total_pending",
      "lb.balance"
    );

  if (balances.length === 0) {
    return {
      content:
        "You don't have any leave balances set up yet. Please contact HR to initialize your leave balances.",
      metadata: { intent: "leave_balance", link: "/leave" },
    };
  }

  let table = "Here are your current leave balances:\n\n";
  table += "| Leave Type | Allocated | Used | Pending | Balance |\n";
  table += "|---|---|---|---|---|\n";

  for (const b of balances) {
    table += `| ${b.leave_type} | ${b.total_allocated} | ${b.total_used} | ${b.total_pending} | **${b.balance}** |\n`;
  }

  table += "\nYou can view full details on the [Leave Dashboard](/leave).";

  return {
    content: table,
    metadata: { intent: "leave_balance", balances, link: "/leave" },
  };
}

async function handleApplyLeave(): Promise<ChatResponse> {
  return {
    content:
      "To apply for leave, follow these steps:\n\n" +
      "1. Go to the **[Leave Applications](/leave/applications)** page\n" +
      "2. Click **\"Apply for Leave\"**\n" +
      "3. Select the leave type, dates, and provide a reason\n" +
      "4. Submit your request for approval\n\n" +
      "Your manager will be notified and can approve or reject the request.",
    metadata: { intent: "apply_leave", link: "/leave/applications" },
  };
}

async function handleAttendance(orgId: number, userId: number): Promise<ChatResponse> {
  const db = getDB();

  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];

  const record = await db("attendance_records")
    .where({
      organization_id: orgId,
      user_id: userId,
      date: dateStr,
    })
    .first();

  if (!record) {
    return {
      content:
        `No attendance record found for today (**${dateStr}**). You haven't checked in yet.\n\n` +
        "You can check in from the [Attendance page](/attendance).",
      metadata: { intent: "attendance", status: "not_checked_in", link: "/attendance" },
    };
  }

  const checkIn = record.check_in
    ? new Date(record.check_in).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "N/A";
  const checkOut = record.check_out
    ? new Date(record.check_out).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "Not yet";

  let statusEmoji = "";
  switch (record.status) {
    case "present":
      statusEmoji = "Present";
      break;
    case "late":
      statusEmoji = "Late";
      break;
    case "half_day":
      statusEmoji = "Half Day";
      break;
    case "absent":
      statusEmoji = "Absent";
      break;
    default:
      statusEmoji = record.status || "Unknown";
  }

  const hours = record.total_hours ? `${Number(record.total_hours).toFixed(1)} hrs` : "In progress";

  return {
    content:
      `Here's your attendance for today (**${dateStr}**):\n\n` +
      `- **Status:** ${statusEmoji}\n` +
      `- **Check-in:** ${checkIn}\n` +
      `- **Check-out:** ${checkOut}\n` +
      `- **Total hours:** ${hours}\n\n` +
      "View full attendance on the [Attendance page](/attendance/my).",
    metadata: { intent: "attendance", record, link: "/attendance/my" },
  };
}

async function handlePolicy(orgId: number): Promise<ChatResponse> {
  const db = getDB();

  const policies = await db("company_policies")
    .where({ organization_id: orgId, is_active: true })
    .orderBy("created_at", "desc")
    .limit(10)
    .select("id", "title", "category", "version", "effective_date");

  if (policies.length === 0) {
    return {
      content: "No company policies have been published yet. Check back later or contact HR.",
      metadata: { intent: "policy", link: "/policies" },
    };
  }

  let response = "Here are the active company policies:\n\n";
  for (const p of policies) {
    response += `- **${p.title}** (v${p.version}) — ${p.category || "General"}\n`;
  }
  response += "\nView and acknowledge policies on the [Policies page](/policies).";

  return {
    content: response,
    metadata: { intent: "policy", policies, link: "/policies" },
  };
}

async function handleHelpdesk(): Promise<ChatResponse> {
  return {
    content:
      "Need help? Here are your options:\n\n" +
      "1. **[Create a Ticket](/helpdesk/my-tickets)** — Raise a support ticket for HR or IT\n" +
      "2. **[Knowledge Base](/helpdesk/kb)** — Browse FAQs and help articles\n" +
      "3. **[My Tickets](/helpdesk/my-tickets)** — Track your existing tickets\n\n" +
      "You can also ask me specific questions about leave, attendance, policies, and more!",
    metadata: { intent: "helpdesk", link: "/helpdesk/my-tickets" },
  };
}

async function handlePayslip(orgId: number): Promise<ChatResponse> {
  const db = getDB();

  // Check if organization has payroll module subscription
  const payrollSub = await db("subscriptions as s")
    .join("modules as m", "m.id", "s.module_id")
    .where({
      "s.organization_id": orgId,
      "m.slug": "emp-payroll",
    })
    .whereIn("s.status", ["active", "trial"])
    .first();

  if (!payrollSub) {
    return {
      content:
        "The Payroll module is not currently active for your organization. " +
        "Please contact your HR admin for salary-related inquiries.",
      metadata: { intent: "payslip" },
    };
  }

  return {
    content:
      "For payslip and salary information, please visit the **Payroll module**.\n\n" +
      "Your HR admin can help with:\n" +
      "- Viewing payslips\n" +
      "- Salary breakdowns\n" +
      "- Tax declarations\n" +
      "- Compensation history\n\n" +
      "Contact HR if you have specific questions about your compensation.",
    metadata: { intent: "payslip", payroll_active: true },
  };
}

async function handleHoliday(orgId: number): Promise<ChatResponse> {
  const db = getDB();

  const today = new Date().toISOString().split("T")[0];

  // Check if leave_calendar table exists — some orgs may not have it
  const hasCalendar = await db.schema.hasTable("leave_calendar");
  if (hasCalendar) {
    const holidays = await db("leave_calendar")
      .where({ organization_id: orgId })
      .where("date", ">=", today)
      .orderBy("date", "asc")
      .limit(10)
      .select("name", "date", "type");

    if (holidays.length > 0) {
      let response = "Upcoming holidays:\n\n";
      for (const h of holidays) {
        const d = new Date(h.date).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        response += `- **${h.name}** — ${d}\n`;
      }
      return {
        content: response,
        metadata: { intent: "holiday", holidays, link: "/leave/calendar" },
      };
    }
  }

  return {
    content:
      "No upcoming holidays found in the calendar. " +
      "Check the [Leave Calendar](/leave/calendar) for the full schedule, or contact HR for details.",
    metadata: { intent: "holiday", link: "/leave/calendar" },
  };
}

async function handleWhoIs(orgId: number, _userId: number, message: string): Promise<ChatResponse> {
  const db = getDB();

  // Extract name from message — remove the keyword prefix
  const cleaned = message
    .toLowerCase()
    .replace(/who is|contact|email of|phone of|find employee|employee details/gi, "")
    .trim();

  if (!cleaned || cleaned.length < 2) {
    return {
      content:
        "Please provide a name to search. For example: *\"Who is John Smith?\"* or *\"Contact email of Jane\"*",
      metadata: { intent: "who_is" },
    };
  }

  const employees = await db("users as u")
    .leftJoin("employee_profiles as ep", function () {
      this.on("ep.user_id", "=", "u.id").andOn("ep.organization_id", "=", "u.organization_id");
    })
    .where("u.organization_id", orgId)
    .where(function () {
      this.whereRaw("LOWER(u.first_name) LIKE ?", [`%${cleaned}%`])
        .orWhereRaw("LOWER(u.last_name) LIKE ?", [`%${cleaned}%`])
        .orWhereRaw("LOWER(CONCAT(u.first_name, ' ', u.last_name)) LIKE ?", [`%${cleaned}%`]);
    })
    .limit(5)
    .select(
      "u.id",
      "u.first_name",
      "u.last_name",
      "u.email",
      "ep.phone",
      "ep.designation",
      "ep.department"
    );

  if (employees.length === 0) {
    return {
      content: `No employees found matching "${cleaned}". Try searching on the [Employee Directory](/employees).`,
      metadata: { intent: "who_is", link: "/employees" },
    };
  }

  let response = `Found ${employees.length} employee(s):\n\n`;
  for (const emp of employees) {
    response += `**${emp.first_name} ${emp.last_name}**\n`;
    if (emp.designation) response += `- Title: ${emp.designation}\n`;
    if (emp.department) response += `- Department: ${emp.department}\n`;
    response += `- Email: ${emp.email}\n`;
    if (emp.phone) response += `- Phone: ${emp.phone}\n`;
    response += `- [View Profile](/employees/${emp.id})\n\n`;
  }

  return {
    content: response,
    metadata: { intent: "who_is", employees, link: "/employees" },
  };
}

async function handleAnnouncement(orgId: number): Promise<ChatResponse> {
  const db = getDB();

  const announcements = await db("announcements")
    .where({ organization_id: orgId, is_active: true })
    .orderBy("published_at", "desc")
    .limit(5)
    .select("id", "title", "priority", "published_at");

  if (announcements.length === 0) {
    return {
      content: "No recent announcements. Check the [Announcements page](/announcements) for updates.",
      metadata: { intent: "announcement", link: "/announcements" },
    };
  }

  let response = "Recent announcements:\n\n";
  for (const a of announcements) {
    const date = new Date(a.published_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const priorityBadge = a.priority === "urgent" ? " [URGENT]" : a.priority === "high" ? " [HIGH]" : "";
    response += `- **${a.title}**${priorityBadge} — ${date}\n`;
  }
  response += "\nView all announcements on the [Announcements page](/announcements).";

  return {
    content: response,
    metadata: { intent: "announcement", announcements, link: "/announcements" },
  };
}

async function handleGreeting(): Promise<ChatResponse> {
  return {
    content:
      "Hello! I'm your **AI HR Assistant**. I can help you with:\n\n" +
      "- **Leave balance** — Check your remaining leaves\n" +
      "- **Apply leave** — How to request time off\n" +
      "- **Attendance** — Today's attendance status\n" +
      "- **Policies** — View company policies\n" +
      "- **Holidays** — Upcoming holidays\n" +
      "- **Announcements** — Latest company news\n" +
      "- **Employee search** — Find a colleague's contact info\n" +
      "- **Payslip** — Salary and compensation info\n" +
      "- **Helpdesk** — Create a support ticket\n\n" +
      "Just type your question and I'll do my best to help!",
    metadata: { intent: "greeting" },
  };
}

function fallbackResponse(): ChatResponse {
  return {
    content:
      "I'm not sure I understand that. Here are some things I can help with:\n\n" +
      "- *\"What is my leave balance?\"*\n" +
      "- *\"How do I apply for leave?\"*\n" +
      "- *\"Show my attendance today\"*\n" +
      "- *\"What are the company policies?\"*\n" +
      "- *\"When is the next holiday?\"*\n" +
      "- *\"Who is John Smith?\"*\n" +
      "- *\"Show latest announcements\"*\n" +
      "- *\"I need help with an issue\"*\n\n" +
      "Try rephrasing your question, or type **\"hi\"** to see all my capabilities.",
    metadata: { intent: "fallback" },
  };
}

// ---------------------------------------------------------------------------
// Core service functions
// ---------------------------------------------------------------------------

export async function createConversation(orgId: number, userId: number) {
  const db = getDB();
  const [id] = await db("chatbot_conversations").insert({
    organization_id: orgId,
    user_id: userId,
    title: null,
    status: "active",
    message_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return db("chatbot_conversations").where({ id }).first();
}

export async function getConversations(orgId: number, userId: number) {
  const db = getDB();
  return db("chatbot_conversations")
    .where({ organization_id: orgId, user_id: userId, status: "active" })
    .orderBy("updated_at", "desc")
    .select("id", "title", "message_count", "created_at", "updated_at");
}

export async function getMessages(orgId: number, conversationId: number) {
  const db = getDB();

  // Verify conversation belongs to org
  const convo = await db("chatbot_conversations")
    .where({ id: conversationId, organization_id: orgId })
    .first();
  if (!convo) throw new NotFoundError("Conversation not found");

  return db("chatbot_messages")
    .where({ conversation_id: conversationId })
    .orderBy("created_at", "asc")
    .select("id", "role", "content", "metadata", "created_at");
}

export async function deleteConversation(orgId: number, conversationId: number) {
  const db = getDB();
  const convo = await db("chatbot_conversations")
    .where({ id: conversationId, organization_id: orgId })
    .first();
  if (!convo) throw new NotFoundError("Conversation not found");

  await db("chatbot_conversations")
    .where({ id: conversationId })
    .update({ status: "archived", updated_at: new Date() });

  return { success: true };
}

export async function sendMessage(
  orgId: number,
  userId: number,
  conversationId: number,
  message: string
) {
  const db = getDB();

  // Verify conversation belongs to this user + org
  const convo = await db("chatbot_conversations")
    .where({ id: conversationId, organization_id: orgId, user_id: userId })
    .first();
  if (!convo) throw new NotFoundError("Conversation not found");

  // Save user message
  const [userMsgId] = await db("chatbot_messages").insert({
    conversation_id: conversationId,
    organization_id: orgId,
    role: "user",
    content: message,
    metadata: null,
    created_at: new Date(),
  });

  // Generate response — use AI agent if available, otherwise rule-based
  let response: ChatResponse;
  const aiProvider = await detectProviderAsync();
  logger.info(`Chatbot provider detected: ${aiProvider} for org ${orgId} user ${userId}`);

  if (aiProvider !== "none") {
    // LLM-powered agent path
    try {
      // Load conversation history for context
      const historyRows = await db("chatbot_messages")
        .where({ conversation_id: conversationId })
        .orderBy("created_at", "asc")
        .select("role", "content")
        .limit(40);

      const history = historyRows
        .filter((h: any) => h.role === "user" || h.role === "assistant")
        .map((h: any) => ({ role: h.role as "user" | "assistant", content: h.content }));

      const aiResponse = await runAgent(orgId, userId, message, history);
      response = {
        content: aiResponse,
        metadata: { engine: "ai", provider: aiProvider },
      };
    } catch (err) {
      logger.error("AI agent error, falling back to rule-based:", err);
      // Fall back to rule-based on AI failure
      const intent = detectIntent(message);
      if (intent) {
        response = await intent.handler(orgId, userId, message);
        response.metadata = { ...response.metadata, engine: "rule-based", ai_fallback: true };
      } else {
        response = fallbackResponse();
        response.metadata = { ...response.metadata, engine: "rule-based", ai_fallback: true };
      }
    }
  } else {
    // Rule-based path (no API key configured)
    try {
      const intent = detectIntent(message);
      if (intent) {
        response = await intent.handler(orgId, userId, message);
      } else {
        response = fallbackResponse();
      }
      response.metadata = { ...response.metadata, engine: "rule-based" };
    } catch (err) {
      logger.error("Chatbot intent handler error:", err);
      response = {
        content: "I encountered an error while processing your request. Please try again or contact HR for assistance.",
        metadata: { intent: "error", engine: "rule-based" },
      };
    }
  }

  // Save assistant response
  const [assistantMsgId] = await db("chatbot_messages").insert({
    conversation_id: conversationId,
    organization_id: orgId,
    role: "assistant",
    content: response.content,
    metadata: response.metadata ? JSON.stringify(response.metadata) : null,
    created_at: new Date(),
  });

  // Update conversation
  const isFirst = convo.message_count === 0;
  const title = isFirst ? message.slice(0, 100) : convo.title;
  await db("chatbot_conversations")
    .where({ id: conversationId })
    .update({
      title,
      message_count: db.raw("message_count + 2"),
      updated_at: new Date(),
    });

  // Return both messages
  const userMsg = await db("chatbot_messages").where({ id: userMsgId }).first();
  const assistantMsg = await db("chatbot_messages").where({ id: assistantMsgId }).first();

  return {
    userMessage: userMsg,
    assistantMessage: assistantMsg,
  };
}

export async function getAIStatus(): Promise<{ engine: string; provider: AIProvider }> {
  const provider = await detectProviderAsync();
  return {
    engine: provider !== "none" ? "ai" : "rule-based",
    provider,
  };
}

export function getSuggestions() {
  return [
    "What is my leave balance?",
    "Show my attendance today",
    "How do I apply for leave?",
    "What are the company policies?",
    "When is the next holiday?",
    "Show latest announcements",
    "I need help with an issue",
    "Who is in the engineering team?",
  ];
}
