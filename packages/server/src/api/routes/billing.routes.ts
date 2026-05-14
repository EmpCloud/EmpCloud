// =============================================================================
// EMP CLOUD — Billing Dashboard Routes
// Proxies billing data (invoices, payments, summary) from EMP Billing.
// =============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import { sendSuccess } from "../../utils/response.js";
import { sendError } from "../../utils/response.js";
import * as billingIntegration from "../../services/billing/billing-integration.service.js";
import { param } from "../../utils/params.js";

const router = Router();

// GET /api/v1/billing/invoices
router.get("/invoices", authenticate, requirePermission("billing:view", "billing:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.perPage as string) || 20;

    const invoices = await billingIntegration.getInvoices(req.user!.org_id, { page, perPage });
    sendSuccess(res, invoices);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/billing/payments
router.get("/payments", authenticate, requirePermission("billing:view", "billing:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.perPage as string) || 20;

    const payments = await billingIntegration.getPayments(req.user!.org_id, { page, perPage });
    sendSuccess(res, payments);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/billing/summary
router.get("/summary", authenticate, requirePermission("billing:view", "billing:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await billingIntegration.getBillingSummary(req.user!.org_id);
    sendSuccess(res, summary);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/billing/invoices/:id/pdf
router.get("/invoices/:id/pdf", authenticate, requirePermission("billing:view", "billing:manage"), async (req: Request, res: Response, next: NextFunction) => {
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

// POST /api/v1/billing/pay — Create a payment checkout session
router.post("/pay", authenticate, requirePermission("billing:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { invoiceId, gateway = "stripe", returnUrl } = req.body;
    if (!invoiceId) {
      sendError(res, 400, "VALIDATION_ERROR", "invoiceId is required");
      return;
    }

    const result = await billingIntegration.createPaymentOrder(
      invoiceId,
      gateway,
      typeof returnUrl === "string" ? returnUrl : undefined,
    );
    if (!result) {
      sendError(res, 502, "BILLING_UNAVAILABLE", "Could not create payment session. Billing service may be unavailable.");
      return;
    }

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/billing/verify-payment — Verify a gateway payment (Razorpay inline / PayPal redirect-return)
router.post("/verify-payment", authenticate, requirePermission("billing:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { invoiceId, gateway, gatewayOrderId, gatewayPaymentId, gatewaySignature } = req.body;
    // PayPal's capture flow only needs the order id (token) — the payment /
    // capture id doesn't exist until after the capture call. Razorpay's inline
    // flow always returns both, so keep requiring gatewayPaymentId there.
    const needsPaymentId = gateway !== "paypal";
    if (!invoiceId || !gateway || !gatewayOrderId || (needsPaymentId && !gatewayPaymentId)) {
      sendError(res, 400, "VALIDATION_ERROR", "invoiceId, gateway, and gatewayOrderId are required (gatewayPaymentId also required for non-PayPal gateways)");
      return;
    }
    const result = await billingIntegration.verifyPayment(invoiceId, gateway, {
      gatewayOrderId,
      gatewayPaymentId: gatewayPaymentId ?? "",
      gatewaySignature,
    });
    if (!result) {
      sendError(res, 502, "BILLING_UNAVAILABLE", "Could not verify payment. Billing service may be unavailable.");
      return;
    }
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/billing/gateways — List available payment gateways
router.get("/gateways", authenticate, requirePermission("billing:view", "billing:manage"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const gateways = await billingIntegration.listPaymentGateways(req.user!.org_id);
    sendSuccess(res, gateways);
  } catch (err) {
    next(err);
  }
});

export default router;
