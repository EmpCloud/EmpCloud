// =============================================================================
// EMP CLOUD — Organization Administration Service (super admin)
//
// Two super-admin capabilities that act on a whole tenant:
//   1. Free-text comments kept against an organization (operator notes).
//   2. Permanent deletion of an organization and everything it owns.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { sanitizePlainText } from "../../utils/sanitize-html.js";
import { clearOrganizationPaymentAccessCache } from "../auth/organization-access-policy.service.js";

/** org_id 0 is the platform org that owns super-admin accounts (migration 036). */
const PLATFORM_ORG_ID = 0;

// ---------------------------------------------------------------------------
// Organization access controls
// ---------------------------------------------------------------------------

export interface OrganizationAccessControls {
  id: number;
  login_blocked: boolean;
  payment_block_enabled: boolean;
}

export async function updateOrganizationAccessControls(params: {
  orgId: number;
  loginBlocked?: boolean;
  paymentBlockEnabled?: boolean;
}): Promise<OrganizationAccessControls> {
  if (params.orgId === PLATFORM_ORG_ID) {
    throw new ForbiddenError("The platform organization cannot be blocked");
  }

  const db = getDB();
  await assertOrgExists(params.orgId);

  const update: Record<string, boolean | Date> = { updated_at: new Date() };
  if (params.loginBlocked !== undefined) update.login_blocked = params.loginBlocked;
  if (params.paymentBlockEnabled !== undefined) {
    update.payment_block_enabled = params.paymentBlockEnabled;
  }

  if (Object.keys(update).length === 1) {
    throw new ValidationError("Provide login_blocked and/or payment_block_enabled");
  }

  await db("organizations").where({ id: params.orgId }).update(update);
  if (params.paymentBlockEnabled !== undefined) {
    clearOrganizationPaymentAccessCache(params.orgId);
  }
  const organization = await db("organizations")
    .where({ id: params.orgId })
    .select("id", "login_blocked", "payment_block_enabled")
    .first();

  return {
    id: Number(organization.id),
    login_blocked: Boolean(organization.login_blocked),
    payment_block_enabled: Boolean(organization.payment_block_enabled),
  };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export interface OrgComment {
  id: number;
  organization_id: number;
  author_user_id: number | null;
  author_name: string | null;
  comment: string;
  edited_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const MAX_COMMENT_LENGTH = 5000;

function normalizeComment(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new ValidationError("Comment cannot be empty");
  if (text.length > MAX_COMMENT_LENGTH) {
    throw new ValidationError(`Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`);
  }
  const sanitized = sanitizePlainText(text);
  if (!sanitized) throw new ValidationError("Comment cannot be empty");
  return sanitized;
}

async function assertOrgExists(orgId: number): Promise<{ id: number; name: string }> {
  const db = getDB();
  const org = await db("organizations").where({ id: orgId }).select("id", "name").first();
  if (!org) throw new NotFoundError("Organization not found");
  return org;
}

export async function listOrgComments(orgId: number): Promise<OrgComment[]> {
  const db = getDB();
  await assertOrgExists(orgId);

  // Left join so a comment survives its author's account being deleted; fall
  // back to the name snapshot taken when the comment was written.
  const rows = await db("organization_comments as oc")
    .leftJoin("users as u", "oc.author_user_id", "u.id")
    .where("oc.organization_id", orgId)
    .select(
      "oc.id",
      "oc.organization_id",
      "oc.author_user_id",
      "oc.comment",
      "oc.edited_at",
      "oc.created_at",
      "oc.updated_at",
      db.raw(
        "COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))),''), oc.author_name) as author_name",
      ),
      "u.email as author_email",
    )
    .orderBy("oc.created_at", "desc")
    .orderBy("oc.id", "desc");

  return rows as OrgComment[];
}

export async function addOrgComment(params: {
  orgId: number;
  authorUserId: number;
  comment: string;
}): Promise<OrgComment> {
  const db = getDB();
  await assertOrgExists(params.orgId);
  const comment = normalizeComment(params.comment);

  const author = await db("users")
    .where({ id: params.authorUserId })
    .select("first_name", "last_name")
    .first();
  const authorName = author
    ? `${author.first_name ?? ""} ${author.last_name ?? ""}`.trim() || null
    : null;

  const [id] = await db("organization_comments").insert({
    organization_id: params.orgId,
    author_user_id: params.authorUserId,
    author_name: authorName,
    comment,
  });

  const created = await db("organization_comments").where({ id }).first();
  return created as OrgComment;
}

export async function updateOrgComment(params: {
  orgId: number;
  commentId: number;
  comment: string;
}): Promise<OrgComment> {
  const db = getDB();
  const comment = normalizeComment(params.comment);

  // Scope by organization_id as well as id so a comment can't be edited through
  // the wrong org's URL.
  const existing = await db("organization_comments")
    .where({ id: params.commentId, organization_id: params.orgId })
    .first();
  if (!existing) throw new NotFoundError("Comment not found");

  await db("organization_comments")
    .where({ id: params.commentId })
    .update({ comment, edited_at: db.fn.now(), updated_at: db.fn.now() });

  const updated = await db("organization_comments").where({ id: params.commentId }).first();
  return updated as OrgComment;
}

export async function deleteOrgComment(params: {
  orgId: number;
  commentId: number;
}): Promise<void> {
  const db = getDB();
  const deleted = await db("organization_comments")
    .where({ id: params.commentId, organization_id: params.orgId })
    .del();
  if (!deleted) throw new NotFoundError("Comment not found");
}

// ---------------------------------------------------------------------------
// Organization deletion
// ---------------------------------------------------------------------------
// A plain `DELETE FROM organizations` does NOT work on this schema. Two groups
// of tables break it, both verified against the live schema:
//
//   1. ~15 FKs point at `users` with ON DELETE NO ACTION (RESTRICT) — including
//      `users.reporting_manager_id`, which is self-referential. Cascading the
//      org into `users` trips those checks and MySQL aborts the whole delete.
//   2. ~10 tables carry an `organization_id` column but NO foreign key to
//      `organizations` (helpdesk_tickets, assets, chatbot_messages, …). Nothing
//      cascades into them, so their rows would silently outlive the tenant.
//
// So we clear both groups explicitly inside a transaction, then delete the org
// row and let the ~73 real CASCADE constraints handle everything else.
//
// Both groups are discovered from information_schema at run time rather than
// hardcoded: new tables get added to this schema regularly, and a stale literal
// list would fail closed (blocked delete) or, worse, fail open (orphaned rows).

interface TableRef {
  table: string;
  column: string;
}

/** Tables with an `organization_id` column but no FK to `organizations`. */
async function findUnlinkedOrgTables(trx: any): Promise<string[]> {
  const rows = await trx.raw(
    `SELECT c.TABLE_NAME AS table_name
       FROM information_schema.COLUMNS c
      WHERE c.TABLE_SCHEMA = DATABASE()
        AND c.COLUMN_NAME = 'organization_id'
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.KEY_COLUMN_USAGE k
           WHERE k.TABLE_SCHEMA = c.TABLE_SCHEMA
             AND k.TABLE_NAME = c.TABLE_NAME
             AND k.COLUMN_NAME = 'organization_id'
             AND k.REFERENCED_TABLE_NAME = 'organizations'
        )`,
  );
  return (rows[0] as any[]).map((r) => r.table_name);
}

/**
 * Tables holding a NO ACTION / RESTRICT FK to `users` that would block the
 * cascade, restricted to those we can scope by `organization_id`.
 */
async function findUserBlockingTables(trx: any): Promise<string[]> {
  const rows = await trx.raw(
    `SELECT DISTINCT k.TABLE_NAME AS table_name
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
        AND r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
       JOIN information_schema.COLUMNS c
         ON c.TABLE_SCHEMA = k.TABLE_SCHEMA
        AND c.TABLE_NAME = k.TABLE_NAME
        AND c.COLUMN_NAME = 'organization_id'
      WHERE k.TABLE_SCHEMA = DATABASE()
        AND k.REFERENCED_TABLE_NAME = 'users'
        AND r.DELETE_RULE IN ('NO ACTION', 'RESTRICT')
        AND k.TABLE_NAME <> 'users'`,
  );
  return (rows[0] as any[]).map((r) => r.table_name);
}

export interface DeleteOrgResult {
  organization_id: number;
  name: string;
  users_deleted: number;
  tables_cleared: number;
  rows_cleared: number;
}

/**
 * Permanently delete an organization and every row that belongs to it.
 *
 * @param orgId              tenant to remove
 * @param confirmName        must equal the org's name exactly — the caller is
 *                           expected to have made a human type it
 * @param actingSuperAdminId guards against an admin deleting their own tenant
 */
export async function deleteOrganization(params: {
  orgId: number;
  confirmName: string;
  actingSuperAdminId: number;
}): Promise<DeleteOrgResult> {
  const db = getDB();
  const { orgId, confirmName, actingSuperAdminId } = params;

  if (orgId === PLATFORM_ORG_ID) {
    throw new ForbiddenError("The platform organization cannot be deleted");
  }

  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) throw new NotFoundError("Organization not found");

  // Typed name must match exactly (after trimming) — this is the last thing
  // standing between a mis-click and an unrecoverable delete.
  if ((confirmName ?? "").trim() !== String(org.name).trim()) {
    throw new ValidationError(
      "Confirmation text does not match the organization name",
    );
  }

  const actor = await db("users").where({ id: actingSuperAdminId }).first();
  if (actor && Number(actor.organization_id) === Number(orgId)) {
    throw new ForbiddenError("You cannot delete the organization you belong to");
  }

  const userCount = Number(
    (await db("users").where({ organization_id: orgId }).count("* as c").first())?.c ?? 0,
  );

  let tablesCleared = 0;
  let rowsCleared = 0;

  await db.transaction(async (trx) => {
    // (a) Break the self-referential manager chain. users.reporting_manager_id
    //     is NO ACTION, so deleting a team and its manager together otherwise
    //     fails no matter what order the cascade picks.
    await trx("users").where({ organization_id: orgId }).update({ reporting_manager_id: null });

    // (b) Clear tables whose NO ACTION FK to `users` would block the cascade.
    for (const table of await findUserBlockingTables(trx)) {
      const n = await trx(table).where({ organization_id: orgId }).del();
      if (n > 0) {
        tablesCleared++;
        rowsCleared += n;
      }
    }

    // (c) Clear tables that carry organization_id but no FK — nothing would
    //     cascade into these, so they'd be orphaned.
    for (const table of await findUnlinkedOrgTables(trx)) {
      const n = await trx(table).where({ organization_id: orgId }).del();
      if (n > 0) {
        tablesCleared++;
        rowsCleared += n;
      }
    }

    // (d) The org row itself — CASCADE takes care of the rest of the schema.
    const deleted = await trx("organizations").where({ id: orgId }).del();
    if (!deleted) throw new NotFoundError("Organization not found");
  });

  logger.warn(
    `Organization ${orgId} ("${org.name}") permanently deleted by user ${actingSuperAdminId}: ` +
      `${userCount} users, ${rowsCleared} extra rows across ${tablesCleared} tables`,
  );

  return {
    organization_id: orgId,
    name: org.name,
    users_deleted: userCount,
    tables_cleared: tablesCleared,
    rows_cleared: rowsCleared,
  };
}

/**
 * What deleting this org would destroy — shown in the confirmation dialog so
 * the operator sees the blast radius before typing the name.
 */
export async function getOrgDeletionImpact(orgId: number): Promise<{
  organization_id: number;
  name: string;
  users: number;
  subscriptions: number;
  is_platform_org: boolean;
}> {
  const db = getDB();
  const org = await assertOrgExists(orgId);

  const [users, subs] = await Promise.all([
    db("users").where({ organization_id: orgId }).count("* as c").first(),
    db("org_subscriptions").where({ organization_id: orgId }).count("* as c").first(),
  ]);

  return {
    organization_id: orgId,
    name: org.name,
    users: Number(users?.c ?? 0),
    subscriptions: Number(subs?.c ?? 0),
    is_platform_org: orgId === PLATFORM_ORG_ID,
  };
}

// Kept for callers that want the shape without importing the interface.
export type { TableRef };
