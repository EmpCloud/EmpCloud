// =============================================================================
// MIGRATION 103 — Seed default document categories
//
// The document-upload form requires a category, but `document_categories` is
// per-org and starts empty, so on every org except the one that had categories
// manually created the dropdown was empty and employees could not upload
// anything. Backfill a sensible default set for every org that currently has
// none. New orgs get the same set at registration time (auth.service).
//
// Idempotent: only orgs with zero categories are touched, so re-running does
// nothing. The list is inlined here (not imported from the service) because a
// migration is a frozen snapshot — it must not change if the service's list
// later does.
// =============================================================================

import { Knex } from "knex";

const DEFAULTS: Array<{ name: string; description: string; is_mandatory: boolean }> = [
  { name: "Identity Proof", description: "Aadhaar, Voter ID or Driving License", is_mandatory: true },
  { name: "PAN Card", description: "Permanent Account Number card", is_mandatory: true },
  { name: "Address Proof", description: "Utility bill, rent agreement or passport", is_mandatory: false },
  { name: "Educational Certificate", description: "Degree, diploma or marksheets", is_mandatory: false },
  { name: "Experience Letter", description: "Relieving / experience letters from previous employers", is_mandatory: false },
  { name: "Bank Details", description: "Cancelled cheque or bank passbook for salary payouts", is_mandatory: true },
  { name: "Resume / CV", description: "Your latest curriculum vitae", is_mandatory: false },
  { name: "Offer / Appointment Letter", description: "Signed offer or appointment letter", is_mandatory: false },
  { name: "Photograph", description: "Recent passport-size photograph", is_mandatory: false },
  { name: "Other", description: "Any other supporting document", is_mandatory: false },
];

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("document_categories"))) return;
  if (!(await knex.schema.hasTable("organizations"))) return;

  // Orgs that already have at least one category are left untouched.
  const orgsWithout = await knex("organizations as o")
    .leftJoin("document_categories as dc", "dc.organization_id", "o.id")
    .whereNull("dc.id")
    .distinct("o.id as id")
    .pluck("o.id");

  if (orgsWithout.length === 0) return;

  const now = new Date();
  const rows = orgsWithout.flatMap((orgId: number) =>
    DEFAULTS.map((c) => ({
      organization_id: orgId,
      name: c.name,
      description: c.description,
      is_mandatory: c.is_mandatory,
      is_active: true,
      created_at: now,
      updated_at: now,
    })),
  );

  // Chunk to keep the insert well under MySQL's max_allowed_packet / placeholder
  // limits on installations with many orgs.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await knex("document_categories").insert(rows.slice(i, i + CHUNK));
  }
}

export async function down(knex: Knex): Promise<void> {
  // Non-destructive: the seeded categories are indistinguishable from
  // hand-created ones and may now own uploaded documents, so leave them.
  void knex;
}
