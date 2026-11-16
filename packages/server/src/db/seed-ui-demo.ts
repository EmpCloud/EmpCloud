// =============================================================================
// EMP CLOUD — Local UI Demo Data
//
// This seed is intentionally separate from the normal application seed. It is
// destructive only to rows carrying the markers below, and it refuses to run
// against a production or non-loopback database.
//
// Example (PowerShell, from the repository root):
//   $env:ALLOW_LOCAL_DEMO_SEED = "1"
//   pnpm --filter @empcloud/server exec tsx src/db/seed-ui-demo.ts --org-id 3 --owner-id 12
//   Remove-Item Env:ALLOW_LOCAL_DEMO_SEED
// =============================================================================

import type { Knex } from "knex";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { closeDB, initDB } from "./connection.js";

const TICKET_MARKER = "[UI Demo]";
const ARTICLE_SLUG_PREFIX = "ui-demo-";
const REQUIRED_TABLES = [
  "organizations",
  "users",
  "helpdesk_tickets",
  "ticket_comments",
  "knowledge_base_articles",
  "kb_article_ratings",
] as const;

type SeedContext = {
  orgId: number;
  ownerId: number;
  assigneeIds: number[];
  now: Date;
};

type TicketSeed = {
  row: Record<string, unknown>;
  comment?: {
    userId: number;
    body: string;
    internal?: boolean;
    createdAt: Date;
  };
};

type SeedSummary = {
  tickets: number;
  comments: number;
  articles: number;
};

function assertLocalSeedAllowed(): void {
  if (config.isProd || config.nodeEnv.trim().toLowerCase() === "production") {
    throw new Error("UI demo data cannot be seeded in production");
  }

  if (process.env.ALLOW_LOCAL_DEMO_SEED !== "1") {
    throw new Error(
      "Set ALLOW_LOCAL_DEMO_SEED=1 to acknowledge this local-only operation",
    );
  }

  const host = config.db.host.trim().toLowerCase();
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!loopbackHosts.has(host)) {
    throw new Error(
      `UI demo data can only be seeded to a local database host (received ${config.db.host})`,
    );
  }
}

function requiredPositiveIntegerArg(flag: "--org-id" | "--owner-id"): number {
  const argv = process.argv.slice(2);
  const inlinePrefix = `${flag}=`;
  const inline = argv.find((value) => value.startsWith(inlinePrefix));
  const index = argv.indexOf(flag);
  const raw = inline?.slice(inlinePrefix.length) ?? (index >= 0 ? argv[index + 1] : undefined);
  const parsed = Number(raw);

  if (!raw || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} is required and must be a positive integer`);
  }

  return parsed;
}

function hoursFrom(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function assignee(context: SeedContext, index: number): number {
  return context.assigneeIds[index % context.assigneeIds.length] ?? context.ownerId;
}

async function assertRequiredTables(db: Knex): Promise<void> {
  const missing: string[] = [];
  for (const table of REQUIRED_TABLES) {
    if (!(await db.schema.hasTable(table))) missing.push(table);
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required tables: ${missing.join(", ")}. Run migrations before seeding UI demo data.`,
    );
  }
}

async function removePriorHelpdeskDemoData(
  trx: Knex.Transaction,
  orgId: number,
): Promise<void> {
  const priorTickets = await trx("helpdesk_tickets")
    .where({ organization_id: orgId })
    .where("subject", "like", `${TICKET_MARKER}%`)
    .select("id");
  const ticketIds = priorTickets.map((ticket) => Number(ticket.id));

  if (ticketIds.length > 0) {
    // Delete explicitly rather than relying on foreign keys because some
    // long-lived local databases predate the full set of migration indexes.
    await trx("ticket_comments")
      .where({ organization_id: orgId })
      .whereIn("ticket_id", ticketIds)
      .delete();
    await trx("helpdesk_tickets")
      .where({ organization_id: orgId })
      .whereIn("id", ticketIds)
      .delete();
  }

  const priorArticles = await trx("knowledge_base_articles")
    .where({ organization_id: orgId })
    .where("slug", "like", `${ARTICLE_SLUG_PREFIX}%`)
    .select("id");
  const articleIds = priorArticles.map((article) => Number(article.id));

  if (articleIds.length > 0) {
    await trx("kb_article_ratings")
      .where({ organization_id: orgId })
      .whereIn("article_id", articleIds)
      .delete();
    await trx("knowledge_base_articles")
      .where({ organization_id: orgId })
      .whereIn("id", articleIds)
      .delete();
  }
}

function buildTicketSeeds(context: SeedContext): TicketSeed[] {
  const { now, orgId, ownerId } = context;
  const ticket = (
    values: Record<string, unknown>,
    comment?: TicketSeed["comment"],
  ): TicketSeed => ({
    row: {
      organization_id: orgId,
      raised_by: ownerId,
      department_id: null,
      tags: JSON.stringify(["ui-demo"]),
      satisfaction_rating: null,
      satisfaction_comment: null,
      closed_at: null,
      resolved_at: null,
      first_response_at: null,
      ...values,
    },
    comment,
  });

  return [
    ticket(
      {
        subject: `${TICKET_MARKER} Payroll deduction does not match payslip`,
        description:
          "<p>The professional tax deduction on this month's payslip is higher than expected. Please verify the payroll calculation.</p>",
        category: "payroll",
        priority: "urgent",
        status: "open",
        assigned_to: assignee(context, 0),
        sla_response_hours: 2,
        sla_resolution_hours: 8,
        created_at: hoursFrom(now, -12),
        updated_at: hoursFrom(now, -11),
        sla_response_due: hoursFrom(now, -10),
        sla_resolution_due: hoursFrom(now, -4),
        first_response_at: hoursFrom(now, -11),
      },
      {
        userId: assignee(context, 0),
        body: "We are reviewing the payroll calculation and will share an update shortly.",
        createdAt: hoursFrom(now, -11),
      },
    ),
    ticket(
      {
        subject: `${TICKET_MARKER} Laptop VPN disconnects repeatedly`,
        description:
          "<p>The company VPN disconnects every few minutes when I work from home, which interrupts access to internal tools.</p>",
        category: "it",
        priority: "high",
        status: "open",
        assigned_to: assignee(context, 1),
        sla_response_hours: 8,
        sla_resolution_hours: 24,
        created_at: hoursFrom(now, -8),
        updated_at: hoursFrom(now, -7),
        sla_response_due: hoursFrom(now, 0),
        sla_resolution_due: hoursFrom(now, 16),
        first_response_at: hoursFrom(now, -7),
      },
      {
        userId: assignee(context, 1),
        body: "Please send the VPN client version and the latest diagnostic log.",
        createdAt: hoursFrom(now, -7),
      },
    ),
    ticket(
      {
        subject: `${TICKET_MARKER} Attendance regularization is not submitting`,
        description:
          "<p>The regularization form remains on the loading state after I select the missed attendance date.</p>",
        category: "general",
        priority: "high",
        status: "in_progress",
        assigned_to: assignee(context, 2),
        sla_response_hours: 8,
        sla_resolution_hours: 24,
        created_at: hoursFrom(now, -22),
        updated_at: hoursFrom(now, -18),
        sla_response_due: hoursFrom(now, -14),
        sla_resolution_due: hoursFrom(now, 2),
        first_response_at: hoursFrom(now, -18),
      },
      {
        userId: assignee(context, 2),
        body: "The issue is reproduced and the attendance team is checking the request workflow.",
        createdAt: hoursFrom(now, -18),
      },
    ),
    ticket(
      {
        subject: `${TICKET_MARKER} Clarification needed on health insurance coverage`,
        description:
          "<p>Please confirm whether the current plan covers dependent dental treatment and where the benefit limits are listed.</p>",
        category: "benefits",
        priority: "medium",
        status: "awaiting_response",
        assigned_to: assignee(context, 0),
        sla_response_hours: 24,
        sla_resolution_hours: 72,
        created_at: hoursFrom(now, -32),
        updated_at: hoursFrom(now, -10),
        sla_response_due: hoursFrom(now, -8),
        sla_resolution_due: hoursFrom(now, 40),
        first_response_at: hoursFrom(now, -10),
      },
      {
        userId: assignee(context, 0),
        body: "Could you confirm the dependent relationship so we can check the applicable coverage?",
        createdAt: hoursFrom(now, -10),
      },
    ),
    ticket(
      {
        subject: `${TICKET_MARKER} Office air-conditioning issue reopened`,
        description:
          "<p>The air-conditioning on the third floor stopped cooling again after yesterday's maintenance visit.</p>",
        category: "facilities",
        priority: "high",
        status: "reopened",
        assigned_to: assignee(context, 1),
        sla_response_hours: 8,
        sla_resolution_hours: 24,
        created_at: hoursFrom(now, -25),
        updated_at: hoursFrom(now, -3),
        sla_response_due: hoursFrom(now, -17),
        sla_resolution_due: hoursFrom(now, -1),
        first_response_at: hoursFrom(now, -20),
      },
      {
        userId: assignee(context, 1),
        body: "The facilities vendor has been asked to revisit the floor today.",
        createdAt: hoursFrom(now, -3),
      },
    ),
    ticket({
      subject: `${TICKET_MARKER} Carry-forward leave balance was corrected`,
      description:
        "<p>My earned leave carry-forward balance did not include the final two days from the previous leave year.</p>",
      category: "leave",
      priority: "medium",
      status: "resolved",
      assigned_to: assignee(context, 2),
      sla_response_hours: 24,
      sla_resolution_hours: 72,
      created_at: hoursFrom(now, -36),
      updated_at: now,
      sla_response_due: hoursFrom(now, -12),
      sla_resolution_due: hoursFrom(now, 36),
      first_response_at: hoursFrom(now, -30),
      resolved_at: now,
      satisfaction_rating: 5,
      satisfaction_comment: "Resolved quickly and the explanation was clear.",
    }),
    ticket({
      subject: `${TICKET_MARKER} Onboarding documents were uploaded late`,
      description:
        "<p>The new-joiner document checklist stayed locked after the joining date and required manual assistance.</p>",
      category: "onboarding",
      priority: "low",
      status: "resolved",
      assigned_to: assignee(context, 0),
      sla_response_hours: 48,
      sla_resolution_hours: 120,
      created_at: hoursFrom(now, -180),
      updated_at: now,
      sla_response_due: hoursFrom(now, -132),
      sla_resolution_due: hoursFrom(now, -60),
      first_response_at: hoursFrom(now, -170),
      resolved_at: now,
      satisfaction_rating: 2,
      satisfaction_comment: "The issue was fixed, but it took longer than expected.",
    }),
    ticket({
      subject: `${TICKET_MARKER} Remote-work policy acknowledgement`,
      description:
        "<p>The acknowledgement button was missing from the latest remote-work policy version.</p>",
      category: "policy",
      priority: "medium",
      status: "resolved",
      assigned_to: assignee(context, 1),
      sla_response_hours: 24,
      sla_resolution_hours: 72,
      created_at: hoursFrom(now, -96),
      updated_at: hoursFrom(now, -40),
      sla_response_due: hoursFrom(now, -72),
      sla_resolution_due: hoursFrom(now, -24),
      first_response_at: hoursFrom(now, -80),
      resolved_at: hoursFrom(now, -40),
      satisfaction_rating: 4,
      satisfaction_comment: "The policy acknowledgement is working now.",
    }),
    ticket({
      subject: `${TICKET_MARKER} Employee profile contact number update`,
      description:
        "<p>My emergency contact number was not saved after updating the employee profile.</p>",
      category: "general",
      priority: "low",
      status: "closed",
      assigned_to: assignee(context, 2),
      sla_response_hours: 48,
      sla_resolution_hours: 120,
      created_at: hoursFrom(now, -240),
      updated_at: hoursFrom(now, -140),
      sla_response_due: hoursFrom(now, -192),
      sla_resolution_due: hoursFrom(now, -120),
      first_response_at: hoursFrom(now, -220),
      resolved_at: hoursFrom(now, -144),
      closed_at: hoursFrom(now, -140),
      satisfaction_rating: 5,
      satisfaction_comment: "Everything is correct now.",
    }),
    ticket({
      subject: `${TICKET_MARKER} Reimbursement component missing from payslip`,
      description:
        "<p>The approved internet reimbursement was missing from the salary component breakdown.</p>",
      category: "payroll",
      priority: "medium",
      status: "closed",
      assigned_to: assignee(context, 0),
      sla_response_hours: 24,
      sla_resolution_hours: 72,
      created_at: hoursFrom(now, -168),
      updated_at: hoursFrom(now, -90),
      sla_response_due: hoursFrom(now, -144),
      sla_resolution_due: hoursFrom(now, -96),
      first_response_at: hoursFrom(now, -150),
      resolved_at: hoursFrom(now, -100),
      closed_at: hoursFrom(now, -90),
      satisfaction_rating: 4,
      satisfaction_comment: "The reimbursement was added in the correction run.",
    }),
    ticket({
      subject: `${TICKET_MARKER} Planned leave calendar is not refreshing`,
      description:
        "<p>A newly approved leave request is visible in applications but has not appeared in the team calendar.</p>",
      category: "leave",
      priority: "low",
      status: "open",
      assigned_to: null,
      sla_response_hours: 48,
      sla_resolution_hours: 120,
      created_at: hoursFrom(now, -3),
      updated_at: hoursFrom(now, -3),
      sla_response_due: hoursFrom(now, 45),
      sla_resolution_due: hoursFrom(now, 117),
    }),
    ticket({
      subject: `${TICKET_MARKER} Multi-factor authentication reset completed`,
      description:
        "<p>I changed phones and needed the old authenticator registration removed from my account.</p>",
      category: "it",
      priority: "high",
      status: "resolved",
      assigned_to: assignee(context, 1),
      sla_response_hours: 8,
      sla_resolution_hours: 24,
      created_at: hoursFrom(now, -72),
      updated_at: hoursFrom(now, -50),
      sla_response_due: hoursFrom(now, -64),
      sla_resolution_due: hoursFrom(now, -48),
      first_response_at: hoursFrom(now, -70),
      resolved_at: hoursFrom(now, -50),
      satisfaction_rating: 3,
      satisfaction_comment: "The reset worked after a second verification call.",
    }),
  ];
}

function buildArticleRows(context: SeedContext): Array<Record<string, unknown>> {
  const { now, orgId, ownerId } = context;
  const article = (
    daysAgo: number,
    values: Record<string, unknown>,
  ): Record<string, unknown> => ({
    organization_id: orgId,
    author_id: ownerId,
    is_published: true,
    is_featured: false,
    created_at: hoursFrom(now, -(daysAgo * 24)),
    updated_at: hoursFrom(now, -(daysAgo * 24)),
    ...values,
  });

  return [
    article(2, {
      title: "How to apply for leave",
      slug: `${ARTICLE_SLUG_PREFIX}how-to-apply-for-leave`,
      category: "leave",
      content:
        "<h2>Submit a leave request</h2><p>Open Leave, choose Apply Leave, select the leave type and dates, add a reason, and submit the request for approval.</p>",
      is_featured: true,
      view_count: 1240,
      helpful_count: 116,
      not_helpful_count: 6,
    }),
    article(4, {
      title: "Understanding your monthly payslip",
      slug: `${ARTICLE_SLUG_PREFIX}understanding-your-monthly-payslip`,
      category: "payroll",
      content:
        "<h2>Payslip overview</h2><p>Your payslip lists earnings, deductions, employer contributions, reimbursements, and the final net-pay calculation.</p>",
      is_featured: true,
      view_count: 980,
      helpful_count: 92,
      not_helpful_count: 8,
    }),
    article(6, {
      title: "Employee health benefits guide",
      slug: `${ARTICLE_SLUG_PREFIX}employee-health-benefits-guide`,
      category: "benefits",
      content:
        "<h2>Benefits at a glance</h2><p>Review plan coverage, dependent eligibility, cashless hospital access, claim documents, and annual benefit limits.</p>",
      is_featured: true,
      view_count: 812,
      helpful_count: 74,
      not_helpful_count: 5,
    }),
    article(8, {
      title: "Resetting your EMP Cloud password",
      slug: `${ARTICLE_SLUG_PREFIX}resetting-your-password`,
      category: "it",
      content:
        "<h2>Password reset</h2><p>Use Forgot password on the sign-in page, open the email link, and create a strong new password before the link expires.</p>",
      view_count: 735,
      helpful_count: 68,
      not_helpful_count: 4,
    }),
    article(10, {
      title: "Reporting a workplace facilities issue",
      slug: `${ARTICLE_SLUG_PREFIX}reporting-a-facilities-issue`,
      category: "facilities",
      content:
        "<h2>Facilities requests</h2><p>Create a helpdesk ticket with the office location, floor, issue details, urgency, and a photo when available.</p>",
      view_count: 544,
      helpful_count: 51,
      not_helpful_count: 7,
    }),
    article(12, {
      title: "New employee onboarding checklist",
      slug: `${ARTICLE_SLUG_PREFIX}new-employee-onboarding-checklist`,
      category: "onboarding",
      content:
        "<h2>Your first-week checklist</h2><p>Complete personal details, upload required documents, acknowledge policies, confirm bank details, and meet your manager.</p>",
      view_count: 692,
      helpful_count: 63,
      not_helpful_count: 3,
    }),
    article(14, {
      title: "Remote-work and attendance policy",
      slug: `${ARTICLE_SLUG_PREFIX}remote-work-attendance-policy`,
      category: "policy",
      content:
        "<h2>Working remotely</h2><p>Follow assigned shift hours, record attendance through the approved channel, and keep your manager informed about schedule changes.</p>",
      view_count: 631,
      helpful_count: 57,
      not_helpful_count: 5,
    }),
    article(16, {
      title: "Updating your employee profile",
      slug: `${ARTICLE_SLUG_PREFIX}updating-your-employee-profile`,
      category: "general",
      content:
        "<h2>Keep your profile current</h2><p>Review personal, contact, emergency, and bank details regularly. Some protected fields require HR approval.</p>",
      view_count: 478,
      helpful_count: 42,
      not_helpful_count: 6,
    }),
    article(18, {
      title: "How earned leave carry-forward works",
      slug: `${ARTICLE_SLUG_PREFIX}earned-leave-carry-forward`,
      category: "leave",
      content:
        "<h2>Carry-forward rules</h2><p>Unused earned leave may move to the next leave year up to the organization's configured balance limit.</p>",
      view_count: 418,
      helpful_count: 37,
      not_helpful_count: 4,
    }),
    article(20, {
      title: "Keeping your account secure",
      slug: `${ARTICLE_SLUG_PREFIX}keeping-your-account-secure`,
      category: "it",
      content:
        "<h2>Account security</h2><p>Use a unique password, enable multi-factor authentication, verify sign-in prompts, and report suspicious activity immediately.</p>",
      view_count: 365,
      helpful_count: 35,
      not_helpful_count: 2,
    }),
    article(22, {
      title: "Where to find company policies",
      slug: `${ARTICLE_SLUG_PREFIX}where-to-find-company-policies`,
      category: "policy",
      content:
        "<h2>Policy library</h2><p>Open Company Policies to review current versions, download attachments, and complete pending acknowledgements.</p>",
      view_count: 302,
      helpful_count: 28,
      not_helpful_count: 3,
    }),
    article(24, {
      title: "Helpdesk ticket priority explained",
      slug: `${ARTICLE_SLUG_PREFIX}ticket-priority-explained`,
      category: "general",
      content:
        "<h2>Choose the right priority</h2><p>Use urgent for business-stopping incidents, high for major disruption, medium for standard requests, and low for informational needs.</p>",
      view_count: 256,
      helpful_count: 24,
      not_helpful_count: 2,
    }),
  ];
}

async function seedHelpdeskDemoData(
  trx: Knex.Transaction,
  context: SeedContext,
): Promise<SeedSummary> {
  await removePriorHelpdeskDemoData(trx, context.orgId);

  let commentCount = 0;
  const ticketSeeds = buildTicketSeeds(context);
  for (const seed of ticketSeeds) {
    const [ticketId] = await trx("helpdesk_tickets").insert(seed.row);
    if (seed.comment) {
      await trx("ticket_comments").insert({
        ticket_id: ticketId,
        organization_id: context.orgId,
        user_id: seed.comment.userId,
        comment: seed.comment.body,
        is_internal: seed.comment.internal ?? false,
        attachments: null,
        created_at: seed.comment.createdAt,
        updated_at: seed.comment.createdAt,
      });
      commentCount++;
    }
  }

  const articles = buildArticleRows(context);
  await trx("knowledge_base_articles").insert(articles);

  return {
    tickets: ticketSeeds.length,
    comments: commentCount,
    articles: articles.length,
  };
}

async function run(): Promise<void> {
  assertLocalSeedAllowed();
  const orgId = requiredPositiveIntegerArg("--org-id");
  const ownerId = requiredPositiveIntegerArg("--owner-id");
  const db = await initDB();

  try {
    await assertRequiredTables(db);

    const summary = await db.transaction(async (trx) => {
      const organization = await trx("organizations").where({ id: orgId }).first("id");
      if (!organization) throw new Error(`Organization ${orgId} does not exist`);

      const owner = await trx("users")
        .where({ id: ownerId, organization_id: orgId, status: 1 })
        .first("id");
      if (!owner) {
        throw new Error(
          `Owner ${ownerId} is not an active user in organization ${orgId}`,
        );
      }

      const activeUsers = await trx("users")
        .where({ organization_id: orgId, status: 1 })
        .orderBy("id", "asc")
        .select("id");
      const assigneeIds = activeUsers.map((user) => Number(user.id));

      const context: SeedContext = {
        orgId,
        ownerId,
        assigneeIds: assigneeIds.length > 0 ? assigneeIds : [ownerId],
        now: new Date(),
      };

      const helpdeskSummary = await seedHelpdeskDemoData(trx, context);

      // Keep additional page-specific seeders inside this transaction. For
      // example, a future seedLeaveDemoData(trx, context) can be added here
      // without weakening the local-only guard or partial-write protection.

      return helpdeskSummary;
    });

    logger.info("Local UI demo data seeded", {
      organization_id: orgId,
      owner_id: ownerId,
      ...summary,
    });
  } finally {
    await closeDB();
  }
}

run().catch((error) => {
  logger.error("Local UI demo seed failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
