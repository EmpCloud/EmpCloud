// =============================================================================
// EMP CLOUD — Seed Data
// Run with: pnpm seed
// Creates demo org, users, modules, subscriptions, and OAuth clients.
// =============================================================================

import { initDB, closeDB, getDB } from "./connection.js";
import { logger } from "../utils/logger.js";
import { hashPassword, generateClientId, generateClientSecret, hashToken } from "../utils/crypto.js";
import { DEFAULT_MODULES } from "@empcloud/shared";

async function seed() {
  await initDB();
  const db = getDB();

  // Run migrations first
  const { up: m001 } = await import("./migrations/001_identity_schema.js");
  const { up: m002 } = await import("./migrations/002_modules_subscriptions.js");
  const { up: m003 } = await import("./migrations/003_oauth2.js");
  const { up: m004 } = await import("./migrations/004_audit_invitations.js");
  await m001(db);
  await m002(db);
  await m003(db);
  await m004(db);
  logger.info("Migrations applied");

  // --- Create Demo Organization ---
  const existingOrg = await db("organizations").where({ name: "TechNova Solutions Pvt. Ltd." }).first();
  if (existingOrg) {
    logger.info("Seed data already exists, skipping");
    await closeDB();
    return;
  }

  const [orgId] = await db("organizations").insert({
    name: "TechNova Solutions Pvt. Ltd.",
    legal_name: "TechNova Solutions Private Limited",
    email: "admin@technova.in",
    contact_number: "+91-9876543210",
    website: "https://technova.in",
    timezone: "Asia/Kolkata",
    country: "IN",
    state: "Karnataka",
    city: "Bengaluru",
    language: "en",
    current_user_count: 5,
    total_allowed_user_count: 100,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });
  logger.info(`Organization created: TechNova Solutions (ID: ${orgId})`);

  // --- Create Departments ---
  const deptNames = ["Engineering", "Design", "Product", "Finance", "HR"];
  const deptIds: number[] = [];
  for (const name of deptNames) {
    const [id] = await db("organization_departments").insert({
      name,
      organization_id: orgId,
      created_at: new Date(),
      updated_at: new Date(),
    });
    deptIds.push(id);
  }

  // --- Create Users ---
  const adminPassword = await hashPassword(process.env.TEST_USER_PASSWORD || "Welcome@123");
  const users = [
    { first_name: "Ananya", last_name: "Gupta", email: "ananya@technova.in", role: "org_admin", dept: 4, designation: "HR Director" },
    { first_name: "Rahul", last_name: "Sharma", email: "rahul@technova.in", role: "hr_admin", dept: 0, designation: "Engineering Lead" },
    { first_name: "Priya", last_name: "Patel", email: "priya@technova.in", role: "employee", dept: 1, designation: "Senior Designer" },
    { first_name: "Vikram", last_name: "Reddy", email: "vikram@technova.in", role: "employee", dept: 2, designation: "Product Manager" },
    { first_name: "Meera", last_name: "Nair", email: "meera@technova.in", role: "employee", dept: 3, designation: "Finance Analyst" },
  ];

  for (const u of users) {
    await db("users").insert({
      organization_id: orgId,
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      password: adminPassword,
      role: u.role,
      designation: u.designation,
      department_id: deptIds[u.dept],
      status: 1,
      date_of_joining: "2025-01-15",
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  logger.info("Users created (password: Welcome@123)");

  // --- Create Modules ---
  const moduleIds: Record<string, number> = {};
  for (const mod of DEFAULT_MODULES) {
    const [id] = await db("modules").insert({
      name: mod.name,
      slug: mod.slug,
      description: mod.description,
      base_url: `https://${mod.slug.replace("emp-", "")}.empcloud.com`,
      is_active: true,
      has_free_tier: ["emp-exit"].includes(mod.slug),
      created_at: new Date(),
      updated_at: new Date(),
    });
    moduleIds[mod.slug] = id;
  }
  logger.info(`${DEFAULT_MODULES.length} modules registered`);

  // --- Add Module Features ---
  const features = [
    { module: "emp-payroll", key: "basic_payroll", name: "Basic Payroll Processing", tier: "basic" },
    { module: "emp-payroll", key: "multi_country_tax", name: "Multi-Country Tax Engines", tier: "professional" },
    { module: "emp-payroll", key: "advanced_compliance", name: "Advanced Compliance Reports", tier: "enterprise" },
    { module: "emp-recruit", key: "job_posting", name: "Job Posting & Pipeline", tier: "free" },
    { module: "emp-recruit", key: "ai_screening", name: "AI Resume Screening", tier: "professional" },
    { module: "emp-monitor", key: "basic_monitoring", name: "Activity Tracking", tier: "basic" },
    { module: "emp-monitor", key: "screenshots", name: "Screenshot Monitoring", tier: "professional" },
    { module: "emp-biometrics", key: "basic_biometric", name: "Basic Biometric Hooks", tier: "basic" },
    { module: "emp-biometrics", key: "facial_recognition", name: "Facial Recognition", tier: "enterprise" },
    { module: "emp-performance", key: "reviews", name: "Performance Reviews & OKRs", tier: "basic" },
    { module: "emp-performance", key: "succession_planning", name: "Succession Planning", tier: "enterprise" },
    { module: "emp-rewards", key: "badges_kudos", name: "Badges & Kudos", tier: "free" },
    { module: "emp-rewards", key: "ai_rewards", name: "AI-Powered Rewards", tier: "professional" },
    { module: "emp-lms", key: "courses_learning", name: "Courses & Learning Paths", tier: "basic" },
    { module: "emp-lms", key: "scorm_xapi", name: "SCORM/xAPI Content Support", tier: "professional" },
    { module: "emp-lms", key: "ai_recommendations", name: "AI Learning Recommendations", tier: "professional" },
    { module: "emp-lms", key: "compliance_training", name: "Compliance Training & Certifications", tier: "basic" },
    { module: "emp-lms", key: "ilt_sessions", name: "Instructor-Led Training (ILT)", tier: "professional" },
    { module: "emp-lms", key: "extended_enterprise", name: "Extended Enterprise Training", tier: "enterprise" },
  ];

  for (const f of features) {
    if (moduleIds[f.module]) {
      await db("module_features").insert({
        module_id: moduleIds[f.module],
        feature_key: f.key,
        name: f.name,
        min_plan_tier: f.tier,
        is_active: true,
      });
    }
  }
  logger.info("Module features created");

  // --- Create Subscriptions for Demo Org ---
  const now = new Date();
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

  for (const slug of ["emp-payroll", "emp-billing"]) {
    const [subId] = await db("org_subscriptions").insert({
      organization_id: orgId,
      module_id: moduleIds[slug],
      plan_tier: "professional",
      status: "active",
      total_seats: 100,
      used_seats: 5,
      billing_cycle: "monthly",
      price_per_seat: 10000, // ₹100/seat/month in paise
      currency: "INR",
      current_period_start: now,
      current_period_end: oneMonthLater,
      created_at: now,
      updated_at: now,
    });

    // Assign seats to all users
    const orgUsers = await db("users").where({ organization_id: orgId, status: 1 });
    for (const u of orgUsers) {
      await db("org_module_seats").insert({
        subscription_id: subId,
        organization_id: orgId,
        module_id: moduleIds[slug],
        user_id: u.id,
        assigned_by: orgUsers[0].id,
        assigned_at: now,
      });
    }
  }
  logger.info("Subscriptions & seats created");

  // --- Register OAuth Clients ---
  const oauthClients = [
    {
      name: "EMP Cloud Dashboard",
      clientId: "empcloud-dashboard",
      isConfidential: false,
      moduleSlug: null,
      redirectUris: ["http://localhost:5173/callback", "https://empcloud.com/callback"],
      scopes: ["openid", "profile", "email"],
      grantTypes: ["authorization_code", "refresh_token"],
    },
    {
      name: "EMP Payroll",
      clientId: "emp-payroll",
      isConfidential: false,
      moduleSlug: "emp-payroll",
      redirectUris: ["http://localhost:5174/callback", "https://payroll.empcloud.com/callback"],
      scopes: ["openid", "profile", "email", "emp-payroll:access"],
      grantTypes: ["authorization_code", "refresh_token"],
    },
    {
      name: "EMP Billing",
      clientId: "emp-billing",
      isConfidential: false,
      moduleSlug: "emp-billing",
      redirectUris: ["http://localhost:5175/callback", "https://billing.empcloud.com/callback"],
      scopes: ["openid", "profile", "email", "emp-billing:access"],
      grantTypes: ["authorization_code", "refresh_token"],
    },
    {
      name: "EMP LMS",
      clientId: "emp-lms",
      isConfidential: false,
      moduleSlug: "emp-lms",
      redirectUris: ["http://localhost:5183/callback", "https://lms.empcloud.com/callback", "https://test-lms.empcloud.com/callback"],
      scopes: ["openid", "profile", "email", "emp-lms:access"],
      grantTypes: ["authorization_code", "refresh_token"],
    },
  ];

  for (const client of oauthClients) {
    await db("oauth_clients").insert({
      client_id: client.clientId,
      client_secret_hash: null, // public clients
      name: client.name,
      module_id: client.moduleSlug ? moduleIds[client.moduleSlug] || null : null,
      redirect_uris: JSON.stringify(client.redirectUris),
      allowed_scopes: JSON.stringify(client.scopes),
      grant_types: JSON.stringify(client.grantTypes),
      is_confidential: client.isConfidential,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  logger.info("OAuth clients registered");

  // --- Create Super Admin User ---
  const existingSuperAdmin = await db("users").where({ email: "admin@empcloud.com" }).first();
  if (!existingSuperAdmin) {
    // Create a platform-level organization for the super admin
    let platformOrgId: number;
    const existingPlatformOrg = await db("organizations").where({ slug: "empcloud-platform" }).first();
    if (existingPlatformOrg) {
      platformOrgId = existingPlatformOrg.id;
    } else {
      [platformOrgId] = await db("organizations").insert({
        name: "EMP Cloud Platform",
        legal_name: "EMP Cloud Platform",
        slug: "empcloud-platform",
        email: "admin@empcloud.com",
        timezone: "Asia/Kolkata",
        country: "IN",
        language: "en",
        current_user_count: 1,
        total_allowed_user_count: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    const superAdminPassword = await hashPassword("SuperAdmin@2026");
    await db("users").insert({
      organization_id: platformOrgId,
      first_name: "Super",
      last_name: "Admin",
      email: "admin@empcloud.com",
      password: superAdminPassword,
      role: "super_admin",
      designation: "Platform Administrator",
      status: 1,
      is_active: true,
      date_of_joining: "2025-01-01",
      created_at: new Date(),
      updated_at: new Date(),
    });
    logger.info("Super admin created: admin@empcloud.com / SuperAdmin@2026");
  } else {
    logger.info("Super admin already exists, skipping");
  }

  logger.info("=== Seed complete ===");
  logger.info("Login: ananya@technova.in / Welcome@123");
  logger.info("Super Admin: admin@empcloud.com / SuperAdmin@2026");
  await closeDB();
}

seed().catch((err) => {
  logger.error("Seed failed", err);
  process.exit(1);
});
