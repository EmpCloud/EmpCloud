// =============================================================================
// EMP CLOUD — Billing Webhook Handler
// Processes inbound webhook events from the EMP Billing module and updates
// Cloud's subscription/audit state accordingly.
// =============================================================================

import { getDB } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";
import { logAudit } from "../audit/audit.service.js";
import { AuditAction } from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function handleWebhook(
  event: string,
  data: Record<string, any>,
  orgId?: number
): Promise<void> {
  logger.info(`Billing webhook received: ${event}`, { orgId });

  switch (event) {
    case "invoice.paid":
      await handleInvoicePaid(data, orgId);
      break;
    case "payment.received":
      await handlePaymentReceived(data, orgId);
      break;
    case "subscription.cancelled":
      await handleSubscriptionCancelled(data, orgId);
      break;
    case "subscription.payment_failed":
      await handlePaymentFailed(data, orgId);
      break;
    case "invoice.overdue":
      await handleInvoiceOverdue(data, orgId);
      break;
    default:
      logger.warn(`Unhandled billing webhook event: ${event}`);
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleInvoicePaid(
  data: Record<string, any>,
  orgId?: number
): Promise<void> {
  const db = getDB();

  // If we can identify the subscription, ensure it's active
  const billingSubId = data.subscriptionId || data.subscription_id;
  if (billingSubId) {
    const mapping = await db("billing_subscription_mappings")
      .where({ billing_subscription_id: String(billingSubId) })
      .first();

    if (mapping) {
      await db("org_subscriptions")
        .where({ id: mapping.cloud_subscription_id })
        .whereIn("status", ["past_due", "trial"])
        .update({ status: "active", updated_at: new Date() });
    }
  }

  await logAudit({
    organizationId: orgId ?? null,
    action: AuditAction.SUBSCRIPTION_UPDATED,
    resourceType: "invoice",
    resourceId: data.invoiceId || data.id || undefined,
    details: { webhook_event: "invoice.paid", ...data },
  });
}

async function handlePaymentReceived(
  data: Record<string, any>,
  orgId?: number
): Promise<void> {
  await logAudit({
    organizationId: orgId ?? null,
    action: AuditAction.SUBSCRIPTION_UPDATED,
    resourceType: "payment",
    resourceId: data.paymentId || data.id || undefined,
    details: { webhook_event: "payment.received", amount: data.amount, ...data },
  });

  logger.info(`Payment received for org ${orgId}: ${data.amount}`);
}

async function handleSubscriptionCancelled(
  data: Record<string, any>,
  orgId?: number
): Promise<void> {
  const db = getDB();

  const billingSubId = data.subscriptionId || data.subscription_id || data.id;
  if (billingSubId) {
    const mapping = await db("billing_subscription_mappings")
      .where({ billing_subscription_id: String(billingSubId) })
      .first();

    if (mapping) {
      await db("org_subscriptions")
        .where({ id: mapping.cloud_subscription_id })
        .update({
          status: "cancelled",
          cancelled_at: new Date(),
          updated_at: new Date(),
        });

      logger.info(`Subscription ${mapping.cloud_subscription_id} cancelled via billing webhook`);
    }
  }

  await logAudit({
    organizationId: orgId ?? null,
    action: AuditAction.SUBSCRIPTION_CANCELLED,
    resourceType: "subscription",
    resourceId: billingSubId ? String(billingSubId) : undefined,
    details: { webhook_event: "subscription.cancelled", ...data },
  });
}

async function handlePaymentFailed(
  data: Record<string, any>,
  orgId?: number
): Promise<void> {
  const db = getDB();

  const billingSubId = data.subscriptionId || data.subscription_id;
  if (billingSubId) {
    const mapping = await db("billing_subscription_mappings")
      .where({ billing_subscription_id: String(billingSubId) })
      .first();

    if (mapping) {
      await db("org_subscriptions")
        .where({ id: mapping.cloud_subscription_id })
        .update({ status: "past_due", updated_at: new Date() });

      logger.warn(`Subscription ${mapping.cloud_subscription_id} marked past_due — payment failed`);
    }
  }

  await logAudit({
    organizationId: orgId ?? null,
    action: AuditAction.SUBSCRIPTION_UPDATED,
    resourceType: "subscription",
    resourceId: billingSubId ? String(billingSubId) : undefined,
    details: { webhook_event: "subscription.payment_failed", ...data },
  });
}

async function handleInvoiceOverdue(
  data: Record<string, any>,
  orgId?: number
): Promise<void> {
  const db = getDB();

  const billingSubId = data.subscriptionId || data.subscription_id;
  if (billingSubId) {
    const mapping = await db("billing_subscription_mappings")
      .where({ billing_subscription_id: String(billingSubId) })
      .first();

    if (mapping) {
      await db("org_subscriptions")
        .where({ id: mapping.cloud_subscription_id })
        .update({ status: "past_due", updated_at: new Date() });

      logger.warn(`Subscription ${mapping.cloud_subscription_id} marked past_due — invoice overdue`);
    }
  }

  await logAudit({
    organizationId: orgId ?? null,
    action: AuditAction.SUBSCRIPTION_UPDATED,
    resourceType: "invoice",
    resourceId: data.invoiceId || data.id || undefined,
    details: { webhook_event: "invoice.overdue", ...data },
  });
}
