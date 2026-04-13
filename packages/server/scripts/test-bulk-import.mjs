// =============================================================================
// EMP CLOUD — Bulk Import Smoke Test
//
// Exercises the /users/import and /users/import/execute endpoints against a
// running local server. Covers:
//   - login + token extraction
//   - Excel file generation with mixed date formats
//   - preview validation (valid rows + error rows)
//   - auto-created departments
//   - executing the import and verifying users exist
//   - privilege-escalation guard on super_admin role
//
// Usage:
//   node scripts/test-bulk-import.mjs
//
// Prereq: local server running on http://localhost:3000, seed org admin
// ananya@technova.in / Welcome@123 exists.
// =============================================================================

import * as XLSX from "xlsx";
import { Blob } from "node:buffer";

const BASE = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const EMAIL = "ananya@technova.in";
const PASSWORD = "Welcome@123";

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}`);
}

function fail(name, details) {
  failed++;
  failures.push({ name, details });
  console.log(`  \x1b[31m✗\x1b[0m ${name}`);
  if (details) console.log(`    ${details}`);
}

function assert(cond, name, details) {
  if (cond) ok(name);
  else fail(name, details);
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let token = "";

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function uploadFile(path, buffer, filename) {
  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

function makeXlsxBuffer(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Users");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function suffix() {
  return Date.now().toString().slice(-8);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function run() {
  section("1. Authentication");
  const loginRes = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  assert(loginRes.status === 200, "login returns 200", `status=${loginRes.status}`);
  token =
    loginRes.body?.data?.tokens?.access_token ||
    loginRes.body?.data?.tokens?.accessToken ||
    loginRes.body?.data?.token;
  assert(token, "login returns access token");
  if (!token) throw new Error("cannot continue without token");

  const U = suffix();
  const uniqueDept = `QA Team ${U}`;

  // -------------------------------------------------------------------------
  section("2. Preview — mixed date formats + unknown department + bad rows");
  const mixedRows = [
    {
      first_name: "Test",
      last_name: "IsoDate",
      email: `iso-${U}@test.local`,
      password: "Welcome@123",
      role: "employee",
      department_name: uniqueDept,
      date_of_joining: "2026-01-15", // ISO
      date_of_birth: "1995-05-10",
    },
    {
      first_name: "Test",
      last_name: "DayFirst",
      email: `dayfirst-${U}@test.local`,
      password: "Welcome@123",
      role: "employee",
      department_name: uniqueDept,
      date_of_joining: "15/01/2026", // DD/MM/YYYY
      date_of_birth: "10/05/1995",
    },
    {
      first_name: "Test",
      last_name: "Human",
      email: `human-${U}@test.local`,
      password: "Welcome@123",
      role: "employee",
      department_name: uniqueDept,
      date_of_joining: "15 Jan 2026", // human
      date_of_birth: "10 May 1995",
    },
    {
      first_name: "Test",
      last_name: "DashDate",
      email: `dash-${U}@test.local`,
      password: "Welcome@123",
      role: "manager",
      department_name: uniqueDept,
      date_of_joining: "15-01-2026", // DD-MM-YYYY
      date_of_birth: "10-05-1995",
    },
    {
      // BAD — missing email
      first_name: "Bad",
      last_name: "NoEmail",
      email: "",
      password: "Welcome@123",
    },
    {
      // BAD — invalid email format
      first_name: "Bad",
      last_name: "BadEmail",
      email: "not-an-email",
      password: "Welcome@123",
    },
    {
      // BAD — password too short
      first_name: "Bad",
      last_name: "ShortPwd",
      email: `short-${U}@test.local`,
      password: "abc",
    },
    {
      // BAD — under 18
      first_name: "Bad",
      last_name: "TooYoung",
      email: `young-${U}@test.local`,
      password: "Welcome@123",
      date_of_birth: "2020-01-01",
    },
    {
      // BAD — unparseable date
      first_name: "Bad",
      last_name: "JunkDate",
      email: `junk-${U}@test.local`,
      password: "Welcome@123",
      date_of_joining: "not a date at all",
    },
  ];

  const previewBuf = makeXlsxBuffer(mixedRows);
  const preview = await uploadFile("/users/import", previewBuf, "users.xlsx");
  assert(preview.status === 200, "preview returns 200", `status=${preview.status} body=${JSON.stringify(preview.body).slice(0, 300)}`);

  const p = preview.body?.data;
  assert(p, "preview returns data object");
  if (!p) return;

  assert(p.totalRows === mixedRows.length, `totalRows = ${mixedRows.length}`, `got ${p.totalRows}`);
  assert(p.valid?.length === 4, "4 valid rows (all 4 date formats parsed)", `got ${p.valid?.length}`);
  assert(p.errors?.length === 5, "5 error rows", `got ${p.errors?.length}`);

  // Each valid row should have normalized date_of_joining to 2026-01-15
  const allNormalized = (p.valid || []).every((r) => r.date_of_joining === "2026-01-15");
  assert(allNormalized, "all 4 date formats normalized to 2026-01-15",
    `got: ${(p.valid || []).map((r) => r.date_of_joining).join(", ")}`);

  // Check the specific errors
  const errMessages = (p.errors || []).flatMap((e) => e.errors);
  assert(errMessages.some((m) => m.includes("email is required")), "missing email caught");
  assert(errMessages.some((m) => m.includes("email format is invalid")), "bad email format caught");
  assert(errMessages.some((m) => m.includes("at least 8 characters")), "short password caught");
  assert(errMessages.some((m) => m.includes("at least 18")), "under-18 caught");
  assert(errMessages.some((m) => m.includes("is not a valid date")), "junk date caught");

  // Department not found should NOT be an error (auto-create)
  assert(!errMessages.some((m) => m.includes("Department")), "unknown department is not an error");

  // -------------------------------------------------------------------------
  section("3. Execute — fails because the file has errors");
  const execFail = await uploadFile("/users/import/execute", previewBuf, "users.xlsx");
  assert(execFail.status === 400, "execute with errors returns 400", `status=${execFail.status}`);
  assert(execFail.body?.data?.error === "Validation failed", "Validation failed message");

  // -------------------------------------------------------------------------
  section("4. Execute — clean import of 4 valid rows");
  const cleanRows = mixedRows.slice(0, 4);
  const cleanBuf = makeXlsxBuffer(cleanRows);
  const exec = await uploadFile("/users/import/execute", cleanBuf, "users.xlsx");
  assert(exec.status === 201, "execute returns 201", `status=${exec.status} body=${JSON.stringify(exec.body).slice(0, 300)}`);
  assert(exec.body?.data?.count === 4, "count=4", `got ${exec.body?.data?.count}`);
  assert(
    (exec.body?.data?.createdDepartments || []).includes(uniqueDept),
    "auto-created new department",
    `got ${JSON.stringify(exec.body?.data?.createdDepartments)}`,
  );

  // -------------------------------------------------------------------------
  section("5. Verify — imported users exist and can log in");
  const listRes = await api("/users?search=" + encodeURIComponent(`test-`));
  // The search won't match "Test IsoDate" directly since it uses first+last name;
  // fall back to checking each explicitly.
  for (const row of cleanRows) {
    const check = await api(`/users?search=${encodeURIComponent(row.email)}`);
    const users = check.body?.data?.users || check.body?.data || [];
    const found = Array.isArray(users) && users.some((u) => u.email === row.email);
    assert(found, `user ${row.email} exists`);
  }

  // Password-login check for the first imported user
  const loginCheck = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: cleanRows[0].email, password: "Welcome@123" }),
  });
  assert(loginCheck.status === 200, "imported user can log in with set password", `status=${loginCheck.status}`);

  // -------------------------------------------------------------------------
  section("6. Privilege escalation — org_admin cannot assign super_admin");
  const escalation = [
    {
      first_name: "Evil",
      last_name: "Escalator",
      email: `escalator-${U}@test.local`,
      password: "Welcome@123",
      role: "super_admin",
    },
  ];
  const escBuf = makeXlsxBuffer(escalation);
  const escRes = await uploadFile("/users/import/execute", escBuf, "users.xlsx");
  assert(
    escRes.status === 403 || escRes.body?.data?.error?.code === "FORBIDDEN" || escRes.body?.error?.code === "FORBIDDEN",
    "super_admin role rejected for org_admin importer",
    `status=${escRes.status} body=${JSON.stringify(escRes.body).slice(0, 200)}`,
  );

  // -------------------------------------------------------------------------
  section("7. Duplicate email inside the file and against existing users");
  const dupes = [
    {
      first_name: "Dupe",
      last_name: "InFile",
      email: `dupe-${U}@test.local`,
      password: "Welcome@123",
    },
    {
      first_name: "Dupe2",
      last_name: "InFile",
      email: `dupe-${U}@test.local`, // duplicate within file
      password: "Welcome@123",
    },
    {
      first_name: "Already",
      last_name: "Exists",
      email: EMAIL, // existing ananya
      password: "Welcome@123",
    },
  ];
  const dupBuf = makeXlsxBuffer(dupes);
  const dupPrev = await uploadFile("/users/import", dupBuf, "users.xlsx");
  const dupMsgs = (dupPrev.body?.data?.errors || []).flatMap((e) => e.errors);
  assert(dupMsgs.some((m) => m.includes("Duplicate email in import file")), "duplicate-in-file caught");
  assert(dupMsgs.some((m) => m.includes("already exists")), "already-exists caught");

  // -------------------------------------------------------------------------
  section("Results");
  console.log(`\n\x1b[1m${passed} passed\x1b[0m, \x1b[${failed ? "31" : "90"}m${failed} failed\x1b[0m`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f.name}${f.details ? ": " + f.details : ""}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("\n\x1b[31mFATAL\x1b[0m", err);
  process.exit(1);
});
