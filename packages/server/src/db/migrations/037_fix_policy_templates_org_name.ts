// =============================================================================
// MIGRATION 037 — Fix seeded policy templates: replace hardcoded "TechNova"
// with the actual organization name for each org's policies.
// Prevents cross-org data leakage in policy content.
// =============================================================================

import { Knex } from "knex";

const SEEDED_TITLES = [
  "Employee Code of Conduct",
  "Annual Leave and Time-Off Policy",
  "Information Security and Acceptable Use Policy",
  "Remote Work and Hybrid Work Policy",
  "Anti-Harassment and Prevention of Sexual Harassment (POSH) Policy",
  "Travel and Expense Reimbursement Policy",
  "Data Protection and Privacy Policy (DPDP Act Compliance)",
  "Performance Management and Appraisal Policy",
  "Recruitment and Hiring Policy",
  "Health Safety and Wellness Policy",
  "Grievance Redressal Policy",
  "Intellectual Property and Confidentiality Agreement",
];

export async function up(knex: Knex): Promise<void> {
  // Get all orgs with their names
  const orgs = await knex("organizations").select("id", "name");
  const orgMap = new Map<number, string>();
  for (const org of orgs) {
    orgMap.set(Number(org.id), org.name || "the Company");
  }

  // Find all seeded policies that still contain "TechNova"
  const policies = await knex("company_policies")
    .whereIn("title", SEEDED_TITLES)
    .where("content", "like", "%TechNova%")
    .select("id", "organization_id", "content");

  for (const policy of policies) {
    const orgName = orgMap.get(Number(policy.organization_id)) || "the Company";
    // Skip if this actually IS TechNova's org
    if (orgName.toLowerCase().includes("technova")) continue;

    const fixedContent = policy.content.replace(/TechNova Solutions Pvt\. Ltd\./g, orgName)
      .replace(/TechNova/g, orgName.split(/\s/)[0])  // Replace standalone "TechNova" refs (e.g. emails)
      .replace(/technova\.in/g, "company.com");       // Replace hardcoded email domains

    await knex("company_policies")
      .where({ id: policy.id })
      .update({ content: fixedContent, updated_at: new Date() });
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Content changes are not easily reversible — no-op
}
