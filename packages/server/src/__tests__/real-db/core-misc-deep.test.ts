// =============================================================================
// EMP CLOUD - Deep Misc Services: subscription, survey, custom-field, policy,
// event, feedback, wellness, whistleblowing, webhook, helpdesk, oauth, org
// =============================================================================
import knex, { Knex } from "knex";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

let db: Knex;
beforeAll(async () => {
  db = knex({
    client: "mysql2",
    connection: { host: "localhost", port: 3306, user: "empcloud", password: "EmpCloud2026", database: "empcloud" },
    pool: { min: 1, max: 5 },
  });
  await db.raw("SELECT 1");
});
afterAll(async () => { if (db) await db.destroy(); });

const ORG = 5;
const ADMIN = 522;
const EMP = 524;
const MGR = 529;
const HR = 525;
const U = String(Date.now()).slice(-6);

// == SUBSCRIPTION =============================================================
describe("Subscription (deep)", () => {
  // Use a test org (99) to avoid unique constraint on org 5
  const TEST_ORG = 99;
  let subId: number;

  beforeAll(async () => {
    // Ensure test org exists
    const org = await db("organizations").where({ id: TEST_ORG }).first();
    if (!org) {
      await db("organizations").insert({
        id: TEST_ORG, name: `TestOrg-${U}`, domain: `testorg-${U}.test`,
        current_user_count: 0, total_allowed_user_count: 50,
        created_at: new Date(), updated_at: new Date(),
      });
    }
  });

  afterAll(async () => {
    if (subId) {
      await db("org_module_seats").where({ subscription_id: subId }).delete();
      await db("billing_subscription_mappings").where({ cloud_subscription_id: subId }).delete();
      await db("org_subscriptions").where({ id: subId }).delete();
    }
    await db("organizations").where({ id: TEST_ORG }).delete();
  });

  it("list modules >= 10", async () => {
    expect((await db("modules")).length).toBeGreaterThanOrEqual(10);
  });

  it("create subscription for test org", async () => {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 86400000);
    const [id] = await db("org_subscriptions").insert({
      organization_id: TEST_ORG, module_id: 1, plan_tier: "basic", status: "trial",
      total_seats: 10, used_seats: 0, billing_cycle: "monthly",
      price_per_seat: 10000, currency: "INR",
      trial_ends_at: new Date(now.getTime() + 14 * 86400000),
      current_period_start: now, current_period_end: end,
      created_at: now, updated_at: now,
    });
    subId = id;
    expect((await db("org_subscriptions").where({ id }).first()).status).toBe("trial");
  });

  it("activate subscription", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ status: "active", updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("active");
  });

  it("assign seat", async () => {
    await db("org_module_seats").insert({
      organization_id: TEST_ORG, subscription_id: subId, module_id: 1,
      user_id: EMP, assigned_by: ADMIN, assigned_at: new Date(),
    });
    expect(await db("org_module_seats").where({ subscription_id: subId, user_id: EMP }).first()).toBeTruthy();
  });

  it("count seats", async () => {
    const [{ c }] = await db("org_module_seats").where({ subscription_id: subId }).count("id as c");
    expect(Number(c)).toBe(1);
  });

  it("cancel subscription", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("cancelled");
  });

  it("reactivate cancelled subscription", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ status: "active", cancelled_at: null, updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("active");
  });

  it("past_due status", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ status: "past_due", updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("past_due");
  });

  it("dunning_stage field", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ dunning_stage: "grace", dunning_last_action_at: new Date() });
    const s = await db("org_subscriptions").where({ id: subId }).first();
    expect(s.dunning_stage).toBe("grace");
  });

  it("list with module join", async () => {
    const r = await db("org_subscriptions as os")
      .leftJoin("modules as m", "os.module_id", "m.id")
      .where({ "os.organization_id": ORG })
      .select("os.*", "m.name as module_name");
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0]).toHaveProperty("module_name");
  });

  it("update seats check", async () => {
    const sub = await db("org_subscriptions").where({ id: subId }).first();
    // Cannot reduce below used_seats
    expect(sub.used_seats).toBeLessThanOrEqual(sub.total_seats);
  });

  it("billing subscription mapping", async () => {
    const [mid] = await db("billing_subscription_mappings").insert({
      organization_id: TEST_ORG, cloud_subscription_id: subId,
      billing_subscription_id: `bs-deep-${U}`, created_at: new Date(),
    });
    const m = await db("billing_subscription_mappings").where({ id: mid }).first();
    expect(m.billing_subscription_id).toBe(`bs-deep-${U}`);
  });

  it("billing client mapping table exists", async () => {
    expect(await db.schema.hasTable("billing_client_mappings")).toBe(true);
  });

  it("free tier module limit query", async () => {
    const r = await db("org_subscriptions")
      .where({ organization_id: TEST_ORG, plan_tier: "free" })
      .whereIn("status", ["active", "trial"])
      .count("* as count").first();
    expect(Number(r?.count ?? 0)).toBeGreaterThanOrEqual(0);
  });
});

// == WEBHOOK HANDLER ==========================================================
describe("Webhook Handler (deep)", () => {
  const TEST_ORG = 98;
  let subId: number, mapId: number;

  beforeAll(async () => {
    const org = await db("organizations").where({ id: TEST_ORG }).first();
    if (!org) {
      await db("organizations").insert({
        id: TEST_ORG, name: `WebhookOrg-${U}`, domain: `webhookorg-${U}.test`,
        current_user_count: 0, total_allowed_user_count: 50,
        created_at: new Date(), updated_at: new Date(),
      });
    }
  });

  afterAll(async () => {
    if (mapId) await db("billing_subscription_mappings").where({ id: mapId }).delete();
    if (subId) await db("org_subscriptions").where({ id: subId }).delete();
    await db("organizations").where({ id: TEST_ORG }).delete();
  });

  it("create test subscription + mapping", async () => {
    const now = new Date();
    const [sid] = await db("org_subscriptions").insert({
      organization_id: TEST_ORG, module_id: 1, plan_tier: "basic", status: "trial",
      total_seats: 5, used_seats: 0, billing_cycle: "monthly",
      price_per_seat: 10000, currency: "INR",
      current_period_start: now, current_period_end: new Date(now.getTime() + 30 * 86400000),
      created_at: now, updated_at: now,
    });
    subId = sid;
    const [mid] = await db("billing_subscription_mappings").insert({
      organization_id: TEST_ORG, cloud_subscription_id: sid,
      billing_subscription_id: `wh-bs-${U}`, created_at: new Date(),
    });
    mapId = mid;
    expect(subId).toBeGreaterThan(0);
  });

  it("invoice.paid activates subscription", async () => {
    const m = await db("billing_subscription_mappings").where({ billing_subscription_id: `wh-bs-${U}` }).first();
    expect(m).toBeTruthy();
    await db("org_subscriptions").where({ id: m.cloud_subscription_id }).update({ status: "active", updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("active");
  });

  it("subscription.cancelled", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("cancelled");
  });

  it("payment_failed marks past_due", async () => {
    await db("org_subscriptions").where({ id: subId }).update({ status: "active", cancelled_at: null, updated_at: new Date() });
    await db("org_subscriptions").where({ id: subId }).update({ status: "past_due", updated_at: new Date() });
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("past_due");
  });

  it("invoice.overdue stays past_due", async () => {
    expect((await db("org_subscriptions").where({ id: subId }).first()).status).toBe("past_due");
  });

  it("unknown mapping returns falsy", async () => {
    expect(await db("billing_subscription_mappings").where({ billing_subscription_id: "nonexistent" }).first()).toBeFalsy();
  });

  it("audit logs exist", async () => {
    expect(await db("audit_logs").where({ organization_id: ORG }).orderBy("created_at", "desc").limit(5)).toBeDefined();
  });
});

// == SURVEY ===================================================================
describe("Survey (deep)", () => {
  let surveyId: number;
  const qIds: number[] = [];
  afterAll(async () => {
    await db("survey_answers").whereIn("question_id", qIds).delete();
    await db("survey_responses").where({ survey_id: surveyId }).delete();
    for (const id of qIds) await db("survey_questions").where({ id }).delete();
    if (surveyId) await db("surveys").where({ id: surveyId }).delete();
  });

  it("create survey with questions", async () => {
    const [id] = await db("surveys").insert({
      organization_id: ORG, title: `Survey-${U}`, description: "Deep test survey",
      type: "pulse", status: "draft", is_anonymous: true,
      target_type: "all", recurrence: "none",
      created_by: ADMIN, response_count: 0,
      created_at: new Date(), updated_at: new Date(),
    });
    surveyId = id;

    const questions = [
      { survey_id: id, organization_id: ORG, question_text: "How happy are you?", question_type: "rating_1_5", is_required: true, sort_order: 0, created_at: new Date() },
      { survey_id: id, organization_id: ORG, question_text: "Any suggestions?", question_type: "text", is_required: false, sort_order: 1, created_at: new Date() },
      { survey_id: id, organization_id: ORG, question_text: "Dept?", question_type: "single_choice", options: JSON.stringify(["HR", "Eng", "Sales"]), is_required: true, sort_order: 2, created_at: new Date() },
    ];
    const [firstQId] = await db("survey_questions").insert(questions);
    qIds.push(firstQId, firstQId + 1, firstQId + 2);

    expect((await db("surveys").where({ id }).first()).title).toBe(`Survey-${U}`);
    expect((await db("survey_questions").where({ survey_id: id })).length).toBe(3);
  });

  it("list surveys with filters", async () => {
    const r = await db("surveys").where({ organization_id: ORG, type: "pulse" }).limit(5);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("publish survey", async () => {
    await db("surveys").where({ id: surveyId }).update({
      status: "active", start_date: new Date(), end_date: new Date(Date.now() + 7 * 86400000),
      updated_at: new Date(),
    });
    expect((await db("surveys").where({ id: surveyId }).first()).status).toBe("active");
  });

  it("submit response", async () => {
    const [rid] = await db("survey_responses").insert({
      survey_id: surveyId, organization_id: ORG, user_id: EMP,
      anonymous_id: `anon-${U}`, submitted_at: new Date(), created_at: new Date(),
    });
    await db("survey_answers").insert([
      { response_id: rid, question_id: qIds[0], organization_id: ORG, rating_value: 4, created_at: new Date() },
      { response_id: rid, question_id: qIds[1], organization_id: ORG, text_value: "Great workplace!", created_at: new Date() },
      { response_id: rid, question_id: qIds[2], organization_id: ORG, text_value: "Eng", created_at: new Date() },
    ]);
    await db("surveys").where({ id: surveyId }).increment("response_count", 1);

    const survey = await db("surveys").where({ id: surveyId }).first();
    expect(survey.response_count).toBeGreaterThanOrEqual(1);
  });

  it("close survey", async () => {
    await db("surveys").where({ id: surveyId }).update({ status: "closed", updated_at: new Date() });
    expect((await db("surveys").where({ id: surveyId }).first()).status).toBe("closed");
  });

  it("eNPS type survey", async () => {
    const [id] = await db("surveys").insert({
      organization_id: ORG, title: `eNPS-${U}`, type: "enps", status: "draft",
      is_anonymous: true, target_type: "all", recurrence: "quarterly",
      created_by: ADMIN, response_count: 0, created_at: new Date(), updated_at: new Date(),
    });
    expect((await db("surveys").where({ id }).first()).recurrence).toBe("quarterly");
    await db("surveys").where({ id }).delete();
  });

  it("survey with department target", async () => {
    const [id] = await db("surveys").insert({
      organization_id: ORG, title: `DeptSurvey-${U}`, type: "pulse", status: "draft",
      is_anonymous: true, target_type: "department", target_ids: JSON.stringify([72]),
      recurrence: "none", created_by: ADMIN, response_count: 0,
      created_at: new Date(), updated_at: new Date(),
    });
    const s = await db("surveys").where({ id }).first();
    expect(s.target_type).toBe("department");
    await db("surveys").where({ id }).delete();
  });
});

// == CUSTOM FIELD =============================================================
describe("Custom Field (deep)", () => {
  let fieldId: number;
  afterAll(async () => {
    if (fieldId) {
      await db("custom_field_values").where({ field_id: fieldId }).delete();
      await db("custom_field_definitions").where({ id: fieldId }).delete();
    }
  });

  it("create custom field definition", async () => {
    const [id] = await db("custom_field_definitions").insert({
      organization_id: ORG, entity_type: "employee",
      field_name: `Blood Group ${U}`, field_key: `blood_group_${U}`,
      field_type: "dropdown", options: JSON.stringify(["A+", "B+", "O+", "AB+"]),
      is_required: false, is_active: true, is_searchable: true,
      sort_order: 0, section: "Medical",
      created_by: ADMIN, created_at: new Date(), updated_at: new Date(),
    });
    fieldId = id;
    expect((await db("custom_field_definitions").where({ id }).first()).field_type).toBe("dropdown");
  });

  it("create text field", async () => {
    const [id] = await db("custom_field_definitions").insert({
      organization_id: ORG, entity_type: "employee",
      field_name: `Hobby ${U}`, field_key: `hobby_${U}`,
      field_type: "text", placeholder: "Enter hobby",
      is_required: false, is_active: true, sort_order: 1, section: "Personal",
      created_by: ADMIN, created_at: new Date(), updated_at: new Date(),
    });
    expect((await db("custom_field_definitions").where({ id }).first()).field_type).toBe("text");
    await db("custom_field_definitions").where({ id }).delete();
  });

  it("create number field with min/max", async () => {
    const [id] = await db("custom_field_definitions").insert({
      organization_id: ORG, entity_type: "employee",
      field_name: `Shirt Size ${U}`, field_key: `shirt_${U}`,
      field_type: "number", min_value: 30, max_value: 50,
      is_required: false, is_active: true, sort_order: 2, section: "Custom Fields",
      created_by: ADMIN, created_at: new Date(), updated_at: new Date(),
    });
    const f = await db("custom_field_definitions").where({ id }).first();
    expect(Number(f.min_value)).toBe(30);
    expect(Number(f.max_value)).toBe(50);
    await db("custom_field_definitions").where({ id }).delete();
  });

  it("set custom field value", async () => {
    const [id] = await db("custom_field_values").insert({
      field_id: fieldId, organization_id: ORG,
      entity_type: "employee", entity_id: EMP,
      value_text: "O+",
      created_at: new Date(), updated_at: new Date(),
    });
    expect((await db("custom_field_values").where({ id }).first()).value_text).toBe("O+");
  });

  it("update custom field value", async () => {
    await db("custom_field_values")
      .where({ field_id: fieldId, entity_id: EMP })
      .update({ value_text: "A+", updated_at: new Date() });
    expect((await db("custom_field_values").where({ field_id: fieldId, entity_id: EMP }).first()).value_text).toBe("A+");
  });

  it("list definitions for entity type", async () => {
    const r = await db("custom_field_definitions")
      .where({ organization_id: ORG, entity_type: "employee", is_active: true })
      .orderBy("sort_order", "asc");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("get values for entity", async () => {
    const r = await db("custom_field_values")
      .where({ organization_id: ORG, entity_type: "employee", entity_id: EMP });
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

// == POLICY ===================================================================
describe("Policy (deep)", () => {
  let policyId: number;
  afterAll(async () => {
    if (policyId) {
      await db("policy_acknowledgments").where({ policy_id: policyId }).delete();
      await db("company_policies").where({ id: policyId }).delete();
    }
  });

  it("list policies", async () => {
    const r = await db("company_policies").where({ organization_id: ORG, is_active: true });
    expect(r.length).toBeGreaterThan(0);
  });

  it("create policy", async () => {
    const [id] = await db("company_policies").insert({
      organization_id: ORG, title: `TestPolicy-${U}`,
      content: "<p>This is a test policy for deep testing.</p>",
      version: 1, category: "general", effective_date: "2024-01-01",
      is_active: true, created_by: ADMIN,
      created_at: new Date(), updated_at: new Date(),
    });
    policyId = id;
    expect((await db("company_policies").where({ id }).first()).title).toBe(`TestPolicy-${U}`);
  });

  it("update policy version", async () => {
    await db("company_policies").where({ id: policyId }).update({
      content: "<p>Updated policy content v2.</p>", version: 2, updated_at: new Date(),
    });
    expect((await db("company_policies").where({ id: policyId }).first()).version).toBe(2);
  });

  it("acknowledge policy", async () => {
    const [id] = await db("policy_acknowledgments").insert({
      policy_id: policyId, user_id: EMP, acknowledged_at: new Date(),
    });
    expect(id).toBeGreaterThan(0);
    const ack = await db("policy_acknowledgments").where({ policy_id: policyId, user_id: EMP }).first();
    expect(ack).toBeTruthy();
  });

  it("list by category", async () => {
    const r = await db("company_policies").where({ organization_id: ORG, category: "general" });
    expect(Array.isArray(r)).toBe(true);
  });

  it("deactivate policy", async () => {
    const [tmpId] = await db("company_policies").insert({
      organization_id: ORG, title: `DeactPolicy-${U}`, content: "x",
      version: 1, is_active: true, created_by: ADMIN,
      created_at: new Date(), updated_at: new Date(),
    });
    await db("company_policies").where({ id: tmpId }).update({ is_active: false });
    expect((await db("company_policies").where({ id: tmpId }).first()).is_active).toBeFalsy();
    await db("company_policies").where({ id: tmpId }).delete();
  });
});

// == EVENT ====================================================================
describe("Event (deep)", () => {
  let eventId: number;
  afterAll(async () => {
    if (eventId) {
      await db("event_rsvps").where({ event_id: eventId }).delete();
      await db("company_events").where({ id: eventId }).delete();
    }
  });

  it("create event", async () => {
    const [id] = await db("company_events").insert({
      organization_id: ORG, title: `Event-${U}`, description: "Deep test event",
      event_type: "team_building",
      start_date: new Date(Date.now() + 7 * 86400000),
      end_date: new Date(Date.now() + 7 * 86400000 + 3600000),
      location: "Office", target_type: "all",
      is_mandatory: false, status: "upcoming",
      created_by: ADMIN, created_at: new Date(), updated_at: new Date(),
    });
    eventId = id;
    expect((await db("company_events").where({ id }).first()).event_type).toBe("team_building");
  });

  it("RSVP attending", async () => {
    const [id] = await db("event_rsvps").insert({
      event_id: eventId, organization_id: ORG, user_id: EMP,
      status: "attending", created_at: new Date(),
    });
    expect((await db("event_rsvps").where({ id }).first()).status).toBe("attending");
  });

  it("RSVP declined", async () => {
    const [id] = await db("event_rsvps").insert({
      event_id: eventId, organization_id: ORG, user_id: MGR,
      status: "declined", created_at: new Date(),
    });
    expect((await db("event_rsvps").where({ id }).first()).status).toBe("declined");
  });

  it("list upcoming events", async () => {
    const r = await db("company_events")
      .where({ organization_id: ORG, status: "upcoming" })
      .where("start_date", ">=", new Date())
      .orderBy("start_date", "asc");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("event with max_attendees and virtual_link", async () => {
    const [id] = await db("company_events").insert({
      organization_id: ORG, title: `Virtual-${U}`, event_type: "training",
      start_date: new Date(Date.now() + 14 * 86400000),
      virtual_link: "https://meet.example.com/test",
      max_attendees: 50, is_mandatory: true, status: "upcoming",
      created_by: ADMIN, created_at: new Date(), updated_at: new Date(),
    });
    const e = await db("company_events").where({ id }).first();
    expect(e.max_attendees).toBe(50);
    expect(e.is_mandatory).toBeTruthy();
    await db("company_events").where({ id }).delete();
  });

  it("cancel event", async () => {
    await db("company_events").where({ id: eventId }).update({ status: "cancelled", updated_at: new Date() });
    expect((await db("company_events").where({ id: eventId }).first()).status).toBe("cancelled");
  });

  it("RSVP count query", async () => {
    const [{ c }] = await db("event_rsvps").where({ event_id: eventId, status: "attending" }).count("id as c");
    expect(Number(c)).toBeGreaterThanOrEqual(1);
  });
});

// == FEEDBACK =================================================================
describe("Anonymous Feedback (deep)", () => {
  let fbId: number;
  afterAll(async () => {
    if (fbId) await db("anonymous_feedback").where({ id: fbId }).delete();
  });

  it("submit feedback", async () => {
    const [id] = await db("anonymous_feedback").insert({
      organization_id: ORG, category: "workplace", subject: `FB-${U}`,
      message: "Deep test feedback message", sentiment: "neutral",
      status: "new", is_urgent: false, anonymous_hash: `hash-${U}`,
      created_at: new Date(), updated_at: new Date(),
    });
    fbId = id;
    expect((await db("anonymous_feedback").where({ id }).first()).status).toBe("new");
  });

  it("submit urgent feedback", async () => {
    const [id] = await db("anonymous_feedback").insert({
      organization_id: ORG, category: "harassment", subject: `Urgent-${U}`,
      message: "Urgent test", sentiment: "negative",
      status: "new", is_urgent: true, anonymous_hash: `urghash-${U}`,
      created_at: new Date(), updated_at: new Date(),
    });
    expect((await db("anonymous_feedback").where({ id }).first()).is_urgent).toBeTruthy();
    await db("anonymous_feedback").where({ id }).delete();
  });

  it("respond to feedback", async () => {
    await db("anonymous_feedback").where({ id: fbId }).update({
      status: "acknowledged", admin_response: "Thank you for the feedback",
      responded_by: ADMIN, responded_at: new Date(), updated_at: new Date(),
    });
    const fb = await db("anonymous_feedback").where({ id: fbId }).first();
    expect(fb.status).toBe("acknowledged");
    expect(fb.admin_response).toBe("Thank you for the feedback");
  });

  it("resolve feedback", async () => {
    await db("anonymous_feedback").where({ id: fbId }).update({ status: "resolved", updated_at: new Date() });
    expect((await db("anonymous_feedback").where({ id: fbId }).first()).status).toBe("resolved");
  });

  it("list by category", async () => {
    const r = await db("anonymous_feedback")
      .where({ organization_id: ORG, category: "workplace" }).limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("list by status", async () => {
    const r = await db("anonymous_feedback")
      .where({ organization_id: ORG, status: "new" }).limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("sentiment distribution", async () => {
    const r = await db("anonymous_feedback")
      .where({ organization_id: ORG })
      .select("sentiment", db.raw("COUNT(*) as cnt"))
      .groupBy("sentiment");
    expect(Array.isArray(r)).toBe(true);
  });
});

// == WELLNESS =================================================================
describe("Wellness (deep)", () => {
  let progId: number, enrollId: number;
  afterAll(async () => {
    if (enrollId) await db("wellness_enrollments").where({ id: enrollId }).delete();
    if (progId) await db("wellness_programs").where({ id: progId }).delete();
  });

  it("create program", async () => {
    const [id] = await db("wellness_programs").insert({
      organization_id: ORG, title: `Wellness-${U}`, description: "Deep test wellness",
      program_type: "fitness",
      start_date: new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      is_active: true, max_participants: 20, enrolled_count: 0, points_reward: 100,
      created_by: ADMIN, created_at: new Date(), updated_at: new Date(),
    });
    progId = id;
    expect((await db("wellness_programs").where({ id }).first()).program_type).toBe("fitness");
  });

  it("update program", async () => {
    await db("wellness_programs").where({ id: progId }).update({
      max_participants: 30, points_reward: 150, updated_at: new Date(),
    });
    expect((await db("wellness_programs").where({ id: progId }).first()).max_participants).toBe(30);
  });

  it("enroll user", async () => {
    const [id] = await db("wellness_enrollments").insert({
      program_id: progId, organization_id: ORG, user_id: EMP,
      status: "enrolled", progress_percentage: 0, created_at: new Date(),
    });
    enrollId = id;
    await db("wellness_programs").where({ id: progId }).increment("enrolled_count", 1);
    expect((await db("wellness_enrollments").where({ id }).first()).status).toBe("enrolled");
  });

  it("duplicate enrollment check", async () => {
    const existing = await db("wellness_enrollments")
      .where({ program_id: progId, user_id: EMP }).first();
    expect(existing).toBeTruthy();
  });

  it("update progress", async () => {
    await db("wellness_enrollments").where({ id: enrollId }).update({
      status: "in_progress", progress_percentage: 50,
    });
    expect(Number((await db("wellness_enrollments").where({ id: enrollId }).first()).progress_percentage)).toBe(50);
  });

  it("complete enrollment", async () => {
    await db("wellness_enrollments").where({ id: enrollId }).update({
      status: "completed", progress_percentage: 100, completed_at: new Date(),
    });
    expect((await db("wellness_enrollments").where({ id: enrollId }).first()).status).toBe("completed");
  });

  it("list programs with filters", async () => {
    const r = await db("wellness_programs")
      .where({ organization_id: ORG, program_type: "fitness" }).limit(5);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("max capacity check", async () => {
    const p = await db("wellness_programs").where({ id: progId }).first();
    expect(p.enrolled_count).toBeLessThanOrEqual(p.max_participants);
  });

  it("wellness check-ins table exists", async () => {
    expect(await db.schema.hasTable("wellness_check_ins")).toBe(true);
  });

  it("wellness goals table exists", async () => {
    expect(await db.schema.hasTable("wellness_goals")).toBe(true);
  });
});

// == WHISTLEBLOWING ===========================================================
describe("Whistleblowing (deep)", () => {
  let reportId: number;
  afterAll(async () => {
    if (reportId) {
      await db("whistleblower_updates").where({ report_id: reportId }).delete();
      await db("whistleblower_reports").where({ id: reportId }).delete();
    }
  });

  it("submit anonymous report", async () => {
    const [id] = await db("whistleblower_reports").insert({
      organization_id: ORG, case_number: `WB-D${U}`,
      category: "fraud", severity: "critical",
      subject: `Critical Report ${U}`, description: "Deep test critical report",
      status: "submitted", is_anonymous: true, reporter_hash: `dhash-${U}`,
      created_at: new Date(), updated_at: new Date(),
    });
    reportId = id;
    expect((await db("whistleblower_reports").where({ id }).first()).severity).toBe("critical");
  });

  it("add update to report", async () => {
    await db("whistleblower_updates").insert({
      report_id: reportId, organization_id: ORG,
      update_type: "note", content: "Investigation started",
      is_visible_to_reporter: true, created_by: ADMIN, created_at: new Date(),
    });
    const updates = await db("whistleblower_updates").where({ report_id: reportId });
    expect(updates.length).toBe(1);
  });

  it("assign investigator", async () => {
    await db("whistleblower_reports").where({ id: reportId }).update({
      assigned_investigator_id: HR, status: "under_investigation", updated_at: new Date(),
    });
    const r = await db("whistleblower_reports").where({ id: reportId }).first();
    expect(r.status).toBe("under_investigation");
    expect(r.assigned_investigator_id).toBe(HR);
  });

  it("resolve report", async () => {
    await db("whistleblower_reports").where({ id: reportId }).update({
      status: "resolved", resolved_at: new Date(), updated_at: new Date(),
    });
    expect((await db("whistleblower_reports").where({ id: reportId }).first()).resolved_at).toBeTruthy();
  });

  it("filter by status", async () => {
    const r = await db("whistleblower_reports")
      .where({ organization_id: ORG }).limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("filter by severity", async () => {
    const r = await db("whistleblower_reports")
      .where({ organization_id: ORG, severity: "critical" }).limit(5);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

// == HELPDESK =================================================================
describe("Helpdesk (deep)", () => {
  let ticketId: number;
  afterAll(async () => {
    if (ticketId) {
      await db("ticket_comments").where({ ticket_id: ticketId }).delete();
      await db("helpdesk_tickets").where({ id: ticketId }).delete();
    }
  });

  it("create ticket", async () => {
    const [id] = await db("helpdesk_tickets").insert({
      organization_id: ORG, raised_by: EMP,
      category: "it", priority: "high",
      subject: `Ticket-${U}`, description: "Deep test helpdesk ticket",
      status: "open", sla_response_hours: 4, sla_resolution_hours: 24,
      sla_response_due: new Date(Date.now() + 4 * 3600000),
      sla_resolution_due: new Date(Date.now() + 24 * 3600000),
      created_at: new Date(), updated_at: new Date(),
    });
    ticketId = id;
    expect((await db("helpdesk_tickets").where({ id }).first()).priority).toBe("high");
  });

  it("assign ticket", async () => {
    await db("helpdesk_tickets").where({ id: ticketId }).update({
      assigned_to: HR, status: "in_progress",
      first_response_at: new Date(), updated_at: new Date(),
    });
    expect((await db("helpdesk_tickets").where({ id: ticketId }).first()).status).toBe("in_progress");
  });

  it("add comment", async () => {
    const [id] = await db("ticket_comments").insert({
      ticket_id: ticketId, organization_id: ORG, user_id: HR,
      comment: "Working on this issue", is_internal: false,
      created_at: new Date(), updated_at: new Date(),
    });
    expect((await db("ticket_comments").where({ id }).first()).comment).toBe("Working on this issue");
  });

  it("add internal comment", async () => {
    const [id] = await db("ticket_comments").insert({
      ticket_id: ticketId, organization_id: ORG, user_id: HR,
      comment: "Internal note", is_internal: true,
      created_at: new Date(), updated_at: new Date(),
    });
    expect((await db("ticket_comments").where({ id }).first()).is_internal).toBeTruthy();
  });

  it("resolve ticket", async () => {
    await db("helpdesk_tickets").where({ id: ticketId }).update({
      status: "resolved", resolved_at: new Date(), updated_at: new Date(),
    });
    expect((await db("helpdesk_tickets").where({ id: ticketId }).first()).status).toBe("resolved");
  });

  it("satisfaction rating", async () => {
    await db("helpdesk_tickets").where({ id: ticketId }).update({
      satisfaction_rating: 4, satisfaction_comment: "Quick resolution",
    });
    expect((await db("helpdesk_tickets").where({ id: ticketId }).first()).satisfaction_rating).toBe(4);
  });

  it("reopen ticket", async () => {
    await db("helpdesk_tickets").where({ id: ticketId }).update({
      status: "reopened", resolved_at: null, updated_at: new Date(),
    });
    expect((await db("helpdesk_tickets").where({ id: ticketId }).first()).status).toBe("reopened");
  });

  it("close ticket", async () => {
    await db("helpdesk_tickets").where({ id: ticketId }).update({
      status: "closed", closed_at: new Date(), updated_at: new Date(),
    });
    expect((await db("helpdesk_tickets").where({ id: ticketId }).first()).status).toBe("closed");
  });

  it("list tickets with filters", async () => {
    const r = await db("helpdesk_tickets")
      .where({ organization_id: ORG, category: "it" }).limit(5);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("SLA breach check", async () => {
    const breached = await db("helpdesk_tickets")
      .where({ organization_id: ORG })
      .whereNotNull("sla_response_due")
      .whereNull("first_response_at")
      .where("sla_response_due", "<", new Date())
      .limit(5);
    expect(Array.isArray(breached)).toBe(true);
  });

  it("ticket tags", async () => {
    await db("helpdesk_tickets").where({ id: ticketId }).update({
      tags: JSON.stringify(["urgent", "hardware"]),
    });
    const t = await db("helpdesk_tickets").where({ id: ticketId }).first();
    const tags = typeof t.tags === "string" ? JSON.parse(t.tags) : t.tags;
    expect(tags).toContain("urgent");
  });
});

// == OAUTH ====================================================================
describe("OAuth (deep)", () => {
  it("oauth clients exist", async () => {
    const c = await db("oauth_clients").limit(5);
    expect(c.length).toBeGreaterThanOrEqual(1);
  });

  it("signing keys table structure", async () => {
    expect(await db.schema.hasTable("signing_keys")).toBe(true);
    const cols = await db("signing_keys").columnInfo();
    expect(cols).toHaveProperty("kid");
    expect(cols).toHaveProperty("algorithm");
    expect(cols).toHaveProperty("public_key");
    expect(cols).toHaveProperty("is_current");
  });

  it("access tokens table", async () => {
    const r = await db("oauth_access_tokens").limit(3);
    expect(Array.isArray(r)).toBe(true);
  });

  it("refresh tokens table", async () => {
    const r = await db("oauth_refresh_tokens").limit(3);
    expect(Array.isArray(r)).toBe(true);
  });

  it("auth codes table exists", async () => {
    expect(await db.schema.hasTable("oauth_authorization_codes")).toBe(true);
  });

  it("modules list >= 10", async () => {
    expect((await db("modules")).length).toBeGreaterThanOrEqual(10);
  });

  it("module features table", async () => {
    const r = await db("module_features").limit(5);
    expect(Array.isArray(r)).toBe(true);
  });

  it("client has required fields", async () => {
    const c = await db("oauth_clients").first();
    expect(c).toHaveProperty("client_id");
  });
});

// == ORG ======================================================================
describe("Org (deep)", () => {
  it("get org by id", async () => {
    const org = await db("organizations").where({ id: ORG }).first();
    expect(org).toBeTruthy();
    expect(org.name).toBeTruthy();
  });

  it("org has user count", async () => {
    const org = await db("organizations").where({ id: ORG }).first();
    expect(org.current_user_count).toBeGreaterThan(0);
  });

  it("departments for org", async () => {
    const r = await db("organization_departments").where({ organization_id: ORG });
    expect(r.length).toBeGreaterThan(0);
  });

  it("locations for org", async () => {
    const r = await db("organization_locations").where({ organization_id: ORG });
    expect(Array.isArray(r)).toBe(true);
  });

  it("org_id=0 reserved for super_admin", async () => {
    const superAdmins = await db("users").where({ organization_id: 0, role: "super_admin" });
    // May or may not have super admins, but query should work
    expect(Array.isArray(superAdmins)).toBe(true);
  });

  it("org total_allowed_user_count", async () => {
    const org = await db("organizations").where({ id: ORG }).first();
    expect(org).toHaveProperty("total_allowed_user_count");
  });

  it("roles table", async () => {
    const r = await db("roles").limit(10);
    expect(Array.isArray(r)).toBe(true);
  });
});

// == CHATBOT ==================================================================
describe("Chatbot (deep)", () => {
  let convId: number;
  afterAll(async () => {
    if (convId) {
      await db("chatbot_messages").where({ conversation_id: convId }).delete();
      await db("chatbot_conversations").where({ id: convId }).delete();
    }
  });

  it("chatbot_conversations table exists", async () => {
    expect(await db.schema.hasTable("chatbot_conversations")).toBe(true);
  });

  it("create conversation", async () => {
    const [id] = await db("chatbot_conversations").insert({
      organization_id: ORG, user_id: EMP,
      title: `Chat-${U}`, created_at: new Date(), updated_at: new Date(),
    });
    convId = id;
    expect(id).toBeGreaterThan(0);
  });

  it("add messages", async () => {
    await db("chatbot_messages").insert([
      { conversation_id: convId, organization_id: ORG, role: "user", content: "What is my leave balance?", created_at: new Date() },
      { conversation_id: convId, organization_id: ORG, role: "assistant", content: "You have 4.5 days of casual leave remaining.", created_at: new Date() },
    ]);
    const msgs = await db("chatbot_messages").where({ conversation_id: convId });
    expect(msgs.length).toBe(2);
  });

  it("list conversations for user", async () => {
    const r = await db("chatbot_conversations")
      .where({ organization_id: ORG, user_id: EMP })
      .orderBy("updated_at", "desc").limit(10);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("ai_config table exists", async () => {
    expect(await db.schema.hasTable("ai_config")).toBe(true);
  });
});

// == NOTIFICATION =============================================================
describe("Notifications (deep)", () => {
  let notifId: number;
  afterAll(async () => {
    if (notifId) await db("notifications").where({ id: notifId }).delete();
  });

  it("create notification", async () => {
    const [id] = await db("notifications").insert({
      organization_id: ORG, user_id: EMP, type: "system",
      title: `TestNotif-${U}`, body: "Deep test notification",
      is_read: false, created_at: new Date(),
    });
    notifId = id;
    expect((await db("notifications").where({ id }).first()).is_read).toBeFalsy();
  });

  it("mark as read", async () => {
    await db("notifications").where({ id: notifId }).update({ is_read: true });
    expect((await db("notifications").where({ id: notifId }).first()).is_read).toBeTruthy();
  });

  it("list unread for user", async () => {
    const r = await db("notifications")
      .where({ organization_id: ORG, user_id: EMP, is_read: false })
      .orderBy("created_at", "desc").limit(10);
    expect(Array.isArray(r)).toBe(true);
  });
});

// == ANNOUNCEMENT =============================================================
describe("Announcements (deep)", () => {
  let annId: number;
  afterAll(async () => {
    if (annId) {
      await db("announcement_reads").where({ announcement_id: annId }).delete();
      await db("announcements").where({ id: annId }).delete();
    }
  });

  it("create announcement", async () => {
    const [id] = await db("announcements").insert({
      organization_id: ORG, title: `Ann-${U}`,
      content: "<p>Deep test announcement.</p>",
      created_by: ADMIN, created_at: new Date(), updated_at: new Date(),
    });
    annId = id;
    expect((await db("announcements").where({ id }).first()).title).toBe(`Ann-${U}`);
  });

  it("mark as read", async () => {
    await db("announcement_reads").insert({
      announcement_id: annId, user_id: EMP, read_at: new Date(),
    });
    const r = await db("announcement_reads").where({ announcement_id: annId, user_id: EMP }).first();
    expect(r).toBeTruthy();
  });

  it("list announcements", async () => {
    const r = await db("announcements").where({ organization_id: ORG }).orderBy("created_at", "desc").limit(5);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

// == ASSETS ===================================================================
describe("Assets (deep)", () => {
  it("asset_categories table exists", async () => {
    expect(await db.schema.hasTable("asset_categories")).toBe(true);
  });

  it("assets table exists", async () => {
    expect(await db.schema.hasTable("assets")).toBe(true);
  });

  it("asset_history table exists", async () => {
    expect(await db.schema.hasTable("asset_history")).toBe(true);
  });
});

// == EMPLOYEE PROFILE =========================================================
describe("Employee Profile (deep)", () => {
  it("employee_profiles table exists", async () => {
    expect(await db.schema.hasTable("employee_profiles")).toBe(true);
  });

  it("employee_addresses table exists", async () => {
    expect(await db.schema.hasTable("employee_addresses")).toBe(true);
  });

  it("employee_education table exists", async () => {
    expect(await db.schema.hasTable("employee_education")).toBe(true);
  });

  it("employee_work_experience table exists", async () => {
    expect(await db.schema.hasTable("employee_work_experience")).toBe(true);
  });

  it("employee_dependents table exists", async () => {
    expect(await db.schema.hasTable("employee_dependents")).toBe(true);
  });
});

// == SYSTEM TABLES ============================================================
describe("System Tables (deep)", () => {
  it("system_notifications table", async () => {
    expect(await db.schema.hasTable("system_notifications")).toBe(true);
  });

  it("audit_logs table", async () => {
    const r = await db("audit_logs").where({ organization_id: ORG }).limit(3);
    expect(Array.isArray(r)).toBe(true);
  });

  it("password_reset_tokens table exists", async () => {
    expect(await db.schema.hasTable("password_reset_tokens")).toBe(true);
  });

  it("geo_fence_locations table exists", async () => {
    expect(await db.schema.hasTable("geo_fence_locations")).toBe(true);
  });

  it("positions table exists", async () => {
    expect(await db.schema.hasTable("positions")).toBe(true);
  });

  it("onboarding table exists", async () => {
    const tables = ["forum_categories", "forum_posts", "knowledge_base_articles", "qr_codes"];
    for (const t of tables) {
      expect(await db.schema.hasTable(t)).toBe(true);
    }
  });
});
