// =============================================================================
// EMP CLOUD — Helpdesk Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { logAudit } from "../../services/audit/audit.service.js";
import * as helpdeskService from "../../services/helpdesk/helpdesk.service.js";
import {
  createTicketSchema,
  updateTicketSchema,
  addCommentSchema,
  rateTicketSchema,
  createArticleSchema,
  updateArticleSchema,
  helpdeskQuerySchema,
  paginationSchema,
  AuditAction,
} from "@empcloud/shared";
import { paramInt, param } from "../../utils/params.js";
import { ROLE_HIERARCHY } from "@empcloud/shared";
import type { UserRole } from "@empcloud/shared";

const router = Router();

// Helper to check if current user has HR-level access
function isHRUser(req: Request): boolean {
  if (!req.user) return false;
  const userRoleLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
  const hrLevel = ROLE_HIERARCHY["hr_manager" as UserRole] ?? 40;
  return userRoleLevel >= hrLevel;
}

// =========================================================================
// TICKETS
// =========================================================================

// POST /api/v1/helpdesk/tickets — Create ticket (any authenticated user)
router.post(
  "/tickets",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createTicketSchema.parse(req.body);
      const ticket = await helpdeskService.createTicket(
        req.user!.org_id,
        req.user!.sub,
        data
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.TICKET_CREATED,
        resourceType: "helpdesk_ticket",
        resourceId: String((ticket as any).id),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, ticket, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/helpdesk/tickets/my — My tickets (employee view)
router.get(
  "/tickets/my",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, per_page } = paginationSchema.parse(req.query);
      const status = req.query.status as string | undefined;
      const category = req.query.category as string | undefined;

      const result = await helpdeskService.getMyTickets(
        req.user!.org_id,
        req.user!.sub,
        { page, perPage: per_page, status, category }
      );
      sendPaginated(res, result.tickets, result.total, page, per_page);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/helpdesk/tickets — List tickets (HR: all, Employee: own)
router.get(
  "/tickets",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = helpdeskQuerySchema.parse(req.query);
      const hr = isHRUser(req);

      // Non-HR users can only see their own tickets
      if (!hr) {
        const result = await helpdeskService.getMyTickets(
          req.user!.org_id,
          req.user!.sub,
          {
            page: filters.page,
            perPage: filters.per_page,
            status: filters.status,
            category: filters.category,
          }
        );
        return sendPaginated(
          res,
          result.tickets,
          result.total,
          filters.page,
          filters.per_page
        );
      }

      const result = await helpdeskService.listTickets(req.user!.org_id, {
        page: filters.page,
        perPage: filters.per_page,
        status: filters.status,
        category: filters.category,
        priority: filters.priority,
        assigned_to: filters.assigned_to,
        raised_by: filters.raised_by,
        search: filters.search,
      });
      sendPaginated(res, result.tickets, result.total, filters.page, filters.per_page);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/helpdesk/tickets/:id — Get ticket detail + comments
router.get(
  "/tickets/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await helpdeskService.getTicket(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub,
        isHRUser(req)
      );
      sendSuccess(res, ticket);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/v1/helpdesk/tickets/:id — Update ticket (HR only)
router.put(
  "/tickets/:id",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateTicketSchema.parse(req.body);
      const ticket = await helpdeskService.updateTicket(
        req.user!.org_id,
        paramInt(req.params.id),
        data
      );
      sendSuccess(res, ticket);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/helpdesk/tickets/:id/assign — Assign ticket (HR only)
router.post(
  "/tickets/:id/assign",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { assigned_to } = req.body;
      const ticket = await helpdeskService.assignTicket(
        req.user!.org_id,
        paramInt(req.params.id),
        assigned_to
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.TICKET_ASSIGNED,
        resourceType: "helpdesk_ticket",
        resourceId: String(paramInt(req.params.id)),
        details: { assigned_to },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, ticket);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/helpdesk/tickets/:id/comment — Add comment
router.post(
  "/tickets/:id/comment",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = addCommentSchema.parse(req.body);

      // Only HR can post internal comments
      const isInternal = data.is_internal && isHRUser(req) ? true : false;

      const comment = await helpdeskService.addComment(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub,
        data.comment,
        isInternal,
        data.attachments
      );
      sendSuccess(res, comment, 201);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/helpdesk/tickets/:id/resolve — Resolve ticket (HR only)
router.post(
  "/tickets/:id/resolve",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await helpdeskService.resolveTicket(
        req.user!.org_id,
        paramInt(req.params.id),
        req.user!.sub
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.TICKET_RESOLVED,
        resourceType: "helpdesk_ticket",
        resourceId: String(paramInt(req.params.id)),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, ticket);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/helpdesk/tickets/:id/close — Close ticket (HR or ticket owner)
router.post(
  "/tickets/:id/close",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await helpdeskService.closeTicket(
        req.user!.org_id,
        paramInt(req.params.id)
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.TICKET_CLOSED,
        resourceType: "helpdesk_ticket",
        resourceId: String(paramInt(req.params.id)),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, ticket);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/helpdesk/tickets/:id/reopen — Reopen ticket (ticket owner)
router.post(
  "/tickets/:id/reopen",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await helpdeskService.reopenTicket(
        req.user!.org_id,
        paramInt(req.params.id)
      );
      sendSuccess(res, ticket);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/helpdesk/tickets/:id/rate — Rate resolved ticket (ticket owner)
router.post(
  "/tickets/:id/rate",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = rateTicketSchema.parse(req.body);
      const ticket = await helpdeskService.rateTicket(
        req.user!.org_id,
        paramInt(req.params.id),
        data.rating,
        data.comment
      );
      sendSuccess(res, ticket);
    } catch (err) {
      next(err);
    }
  }
);

// =========================================================================
// KNOWLEDGE BASE
// =========================================================================

// GET /api/v1/helpdesk/kb — List published articles (any auth user)
router.get(
  "/kb",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, per_page } = paginationSchema.parse(req.query);
      const category = req.query.category as string | undefined;
      const search = req.query.search as string | undefined;

      const result = await helpdeskService.listArticles(req.user!.org_id, {
        page,
        perPage: per_page,
        category,
        search,
        published_only: !isHRUser(req) ? true : (req.query.all !== "true"),
      });
      sendPaginated(res, result.articles, result.total, page, per_page);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/helpdesk/kb/:idOrSlug — Get article + increment views
router.get(
  "/kb/:idOrSlug",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const article = await helpdeskService.getArticle(
        req.user!.org_id,
        param(req.params.idOrSlug)
      );
      sendSuccess(res, article);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/helpdesk/kb — Create article (HR only)
router.post(
  "/kb",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createArticleSchema.parse(req.body);
      const article = await helpdeskService.createArticle(
        req.user!.org_id,
        req.user!.sub,
        data
      );

      await logAudit({
        organizationId: req.user!.org_id,
        userId: req.user!.sub,
        action: AuditAction.KB_ARTICLE_CREATED,
        resourceType: "knowledge_base_article",
        resourceId: String((article as any).id),
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, article, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/v1/helpdesk/kb/:id — Update article (HR only)
router.put(
  "/kb/:id",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateArticleSchema.parse(req.body);
      const article = await helpdeskService.updateArticle(
        req.user!.org_id,
        paramInt(req.params.id),
        data
      );
      sendSuccess(res, article);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/v1/helpdesk/kb/:id — Unpublish article (HR only)
router.delete(
  "/kb/:id",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await helpdeskService.deleteArticle(
        req.user!.org_id,
        paramInt(req.params.id)
      );
      sendSuccess(res, { message: "Article unpublished" });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/helpdesk/kb/:id/helpful — Rate article helpfulness
router.post(
  "/kb/:id/helpful",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { helpful } = req.body;
      const article = await helpdeskService.rateArticle(
        req.user!.org_id,
        paramInt(req.params.id),
        helpful === true
      );
      sendSuccess(res, article);
    } catch (err) {
      next(err);
    }
  }
);

// =========================================================================
// DASHBOARD
// =========================================================================

// GET /api/v1/helpdesk/dashboard — Helpdesk stats (HR only)
router.get(
  "/dashboard",
  authenticate,
  requireHR,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await helpdeskService.getHelpdeskDashboard(req.user!.org_id);
      sendSuccess(res, stats);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
