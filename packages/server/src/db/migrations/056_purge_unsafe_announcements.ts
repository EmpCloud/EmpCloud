// =============================================================================
// MIGRATION 056 — Purge announcements with SSTI / XSS probe payloads
//
// Reported as #270 (against payroll, but payroll's announcements page is a
// read-only mirror of EmpCloud's announcements, so the actual data lives
// here). Production has live announcement rows with security-probe
// payloads as their title or content:
//
//   #{7*7}        ${7*7}        {{7*7}}        <%= 7*7 %>
//   <img src=x onerror=alert(1)>
//   <script>alert(document.cookie)</script>
//
// PR #1763 added a write-time validator (SSTI_PROBE_RE +
// `<script` / onerror= guards in the create/update schemas), so new
// payloads are rejected. This migration cleans up the rows that
// landed before that validator was in place.
//
// Strategy: any row whose title OR content contains a recognised
// SSTI bracket-with-arithmetic, a `<script` tag, or an `onerror=`
// attribute is deleted. The `announcement_reads` FK has ON DELETE
// CASCADE (per migration 009) so dependent rows go with them.
//
// Logged loudly so the operator running the migration sees exactly
// what got removed and from which org. Idempotent — re-running on a
// clean dataset matches no rows.
// =============================================================================

import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("announcements"))) return;

  // MySQL REGEXP patterns. Each one matches a different probe family:
  //   - {{ 7*7 }} / {{7*7}}              — Jinja / Handlebars / Mustache
  //   - ${ 7*7 } / ${7*7}                — JS / Groovy / shell expansion
  //   - <%= 7*7 %> / <% 7*7 %>           — ERB / EJS / JSP scriptlet
  //   - #{ 7*7 } / #{7*7}                — Ruby / Rails interpolation
  //   - <script ... >                    — XSS script tag
  //   - on*= (onerror, onload, onclick)  — XSS event handler
  // The arithmetic-inside-brackets check is intentional: legit copy
  // like "{{user_name}}" or "${BUDGET}" survives, only obvious probes
  // trip the filter.
  const probeRows: Array<{ id: number; organization_id: number; title: string }> =
    await knex("announcements")
      .where(function () {
        // SSTI families with arithmetic inside the brackets
        this.whereRaw(`title REGEXP '\\\\{\\\\{[[:space:]]*[0-9]+[[:space:]]*[*+/-][[:space:]]*[0-9]+[[:space:]]*\\\\}\\\\}'`)
          .orWhereRaw(`content REGEXP '\\\\{\\\\{[[:space:]]*[0-9]+[[:space:]]*[*+/-][[:space:]]*[0-9]+[[:space:]]*\\\\}\\\\}'`)
          .orWhereRaw(`title REGEXP '\\\\$\\\\{[[:space:]]*[0-9]+[[:space:]]*[*+/-][[:space:]]*[0-9]+[[:space:]]*\\\\}'`)
          .orWhereRaw(`content REGEXP '\\\\$\\\\{[[:space:]]*[0-9]+[[:space:]]*[*+/-][[:space:]]*[0-9]+[[:space:]]*\\\\}'`)
          .orWhereRaw(`title REGEXP '<%=?[[:space:]]*[0-9]+[[:space:]]*[*+/-]'`)
          .orWhereRaw(`content REGEXP '<%=?[[:space:]]*[0-9]+[[:space:]]*[*+/-]'`)
          .orWhereRaw(`title REGEXP '#\\\\{[[:space:]]*[0-9]+[[:space:]]*[*+/-][[:space:]]*[0-9]+[[:space:]]*\\\\}'`)
          .orWhereRaw(`content REGEXP '#\\\\{[[:space:]]*[0-9]+[[:space:]]*[*+/-][[:space:]]*[0-9]+[[:space:]]*\\\\}'`)
          // XSS shapes
          .orWhereRaw(`LOWER(title) LIKE '%<script%'`)
          .orWhereRaw(`LOWER(content) LIKE '%<script%'`)
          .orWhereRaw(`LOWER(title) REGEXP 'on(error|load|click|focus|mouseover)=' `)
          .orWhereRaw(`LOWER(content) REGEXP 'on(error|load|click|focus|mouseover)='`);
      })
      .select("id", "organization_id", "title");

  if (probeRows.length === 0) return;

  for (const row of probeRows) {
    const preview = String(row.title || "").slice(0, 120);
    // eslint-disable-next-line no-console
    console.warn(
      `[migration 056] Purging unsafe announcement id=${row.id} org=${row.organization_id} title="${preview}"`,
    );
  }

  // announcement_reads.announcement_id is ON DELETE CASCADE per
  // migration 009, so dependents disappear with the parent row.
  await knex("announcements")
    .whereIn(
      "id",
      probeRows.map((r) => r.id),
    )
    .delete();
}

export async function down(_knex: Knex): Promise<void> {
  // One-way data fix; restoring purged probe payloads would re-introduce
  // the security issue. No-op so the migration registry stays consistent
  // if someone migrates down.
}
