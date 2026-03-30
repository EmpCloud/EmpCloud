// =============================================================================
// EMP CLOUD — Manager Self-Service Routes
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/rbac.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import * as managerService from "../../services/manager/manager.service.js";
import type { UserRole } from "@empcloud/shared";

const router = Router();

// Middleware: ensure user is authenticated AND has at least manager role
router.use(authenticate, requireRole("manager" as UserRole));

// GET /api/v1/manager/team — My direct reports
router.get("/team", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = await managerService.getMyTeam(req.user!.org_id, req.user!.sub);
    sendSuccess(res, team);
  } catch (err) { next(err); }
});

// GET /api/v1/manager/attendance — Team attendance today
router.get("/attendance", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await managerService.getTeamAttendanceToday(req.user!.org_id, req.user!.sub);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// GET /api/v1/manager/leaves/pending — Pending leave approvals for my team
router.get("/leaves/pending", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pending = await managerService.getTeamPendingLeaves(req.user!.org_id, req.user!.sub);
    sendSuccess(res, pending);
  } catch (err) { next(err); }
});

// GET /api/v1/manager/leaves/calendar — Team leave calendar
router.get("/leaves/calendar", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Default to current week (Mon-Sun)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startDate = (req.query.start_date as string) || monday.toISOString().slice(0, 10);
    const endDate = (req.query.end_date as string) || sunday.toISOString().slice(0, 10);

    const calendar = await managerService.getTeamLeaveCalendar(
      req.user!.org_id,
      req.user!.sub,
      startDate,
      endDate,
    );
    sendSuccess(res, calendar);
  } catch (err) { next(err); }
});

// GET /api/v1/manager/dashboard — Combined dashboard stats
router.get("/dashboard", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboard = await managerService.getManagerDashboard(req.user!.org_id, req.user!.sub);
    sendSuccess(res, dashboard);
  } catch (err) { next(err); }
});

export default router;
