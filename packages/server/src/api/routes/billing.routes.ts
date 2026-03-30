// =============================================================================
// EMP CLOUD — Billing Dashboard Routes
// Proxies billing data (invoices, payments, summary) from EMP Billing.
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireHR } from "../middleware/rbac.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import { sendError } from "../../utils/response.js";
import * as billingIntegration from "../../services/billing/billing-integration.service.js";
import { param } from "../../utils/params.js";

const router = Router();

// GET /api/v1/billing/invoices (HR+ only)
router.get("/invoices", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.perPage as string) || 20;

    const invoices = await billingIntegration.getInvoices(req.user!.org_id, { page, perPage });
    sendSuccess(res, invoices);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/billing/payments (HR+ only)
router.get("/payments", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.perPage as string) || 20;

    const payments = await billingIntegration.getPayments(req.user!.org_id, { page, perPage });
    sendSuccess(res, payments);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/billing/summary (HR+ only)
router.get("/summary", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await billingIntegration.getBillingSummary(req.user!.org_id);
    sendSuccess(res, summary);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/billing/invoices/:id/pdf (HR+ only)
router.get("/invoices/:id/pdf", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoiceId = param(req.params.id);
    const pdfResponse = await billingIntegration.getInvoicePdfStream(invoiceId);

    if (!pdfResponse || !pdfResponse.body) {
      sendError(res, 502, "BILLING_UNAVAILABLE", "Could not fetch invoice PDF from billing service");
      return;
    }

    // Forward headers from the billing response
    const contentType = pdfResponse.headers.get("content-type") || "application/pdf";
    const contentDisposition = pdfResponse.headers.get("content-disposition");

    res.setHeader("Content-Type", contentType);
    if (contentDisposition) {
      res.setHeader("Content-Disposition", contentDisposition);
    } else {
      res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoiceId}.pdf"`);
    }

    // Stream the response body to the client
    const arrayBuffer = await pdfResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/billing/pay — Create a payment checkout session (HR+ only)
router.post("/pay", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { invoiceId, gateway = "stripe" } = req.body;
    if (!invoiceId) {
      sendError(res, 400, "VALIDATION_ERROR", "invoiceId is required");
      return;
    }

    const result = await billingIntegration.createPaymentOrder(invoiceId, gateway);
    if (!result) {
      sendError(res, 502, "BILLING_UNAVAILABLE", "Could not create payment session. Billing service may be unavailable.");
      return;
    }

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/billing/gateways — List available payment gateways (HR+ only)
router.get("/gateways", authenticate, requireHR, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const gateways = await billingIntegration.listPaymentGateways(req.user!.org_id);
    sendSuccess(res, gateways);
  } catch (err) {
    next(err);
  }
});

export default router;
