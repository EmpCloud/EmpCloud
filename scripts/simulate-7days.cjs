// =============================================================================
// EMP CLOUD -- 7-Day NexGen Technologies HR Simulation
// =============================================================================
// Usage: node scripts/simulate-7days.cjs
//
// Simulates 7 consecutive days of realistic HR operations for NexGen Technologies.
// Attendance records are inserted directly via SSH + MySQL (to avoid "already
// checked in today" conflicts). All other actions use the EMP Cloud REST API.
//
// Day layout (all backdated so the 7 days appear as history):
//   Day 1 = 6 days ago (Mon), Day 2 = 5 days ago (Tue), ..., Day 7 = today (Sun)
// =============================================================================

const https = require("https");
const http = require("http");
const { Client: SSHClient } = require("ssh2");

// ---------------------------------------------------------------------------
// Configuration (test server only)
// ---------------------------------------------------------------------------
const API_BASE = "https://test-empcloud-api.empcloud.com";
const CEO_EMAIL = "vikram@nexgen.tech";
const DEFAULT_PASSWORD = "NexGen@2026";

const SSH_HOST = "163.227.174.141";
const SSH_PORT = 22;
const SSH_USER = "empcloud-development";
const SSH_PASS = process.env.SSH_PASSWORD || "";

const MYSQL_USER = "empcloud";
const MYSQL_PASS = process.env.DB_PASSWORD || "";
const MYSQL_DB = "empcloud";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Simple HTTP(S) request returning parsed JSON */
function apiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const isHttps = url.protocol === "https:";
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    };
    if (token) options.headers["Authorization"] = `Bearer ${token}`;
    const mod = isHttps ? https : http;
    const req = mod.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function api(method, path, body, token) {
  const res = await apiRequest(method, path, body, token);
  if (res.status >= 400) {
    const msg = res.body?.error?.message || res.body?.message || JSON.stringify(res.body).substring(0, 200);
    console.error(`    [API ${res.status}] ${method} ${path}: ${msg}`);
  }
  return res;
}

/** Login and return { token, user } */
async function login(email, password) {
  const res = await api("POST", "/api/v1/auth/login", { email, password });
  if (res.status >= 400) return null;
  const d = res.body.data || res.body;
  const token = d.tokens?.access_token || d.access_token || d.token;
  return { token, user: d.user };
}

/** Execute a MySQL command on the remote server via SSH */
function sshExecMySQL(sql) {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    conn
      .on("ready", () => {
        // Use heredoc so we don't have to worry about quoting
        const cmd = `mysql -u${MYSQL_USER} -p'${MYSQL_PASS}' ${MYSQL_DB} <<'EOSQL'\n${sql}\nEOSQL`;
        conn.exec(cmd, (err, stream) => {
          if (err) { conn.end(); return reject(err); }
          let out = "", errOut = "";
          stream.on("data", (d) => (out += d));
          stream.stderr.on("data", (d) => (errOut += d));
          stream.on("close", (code) => {
            conn.end();
            if (code !== 0 && errOut && !errOut.includes("Warning")) {
              return reject(new Error(`MySQL error (code ${code}): ${errOut}`));
            }
            resolve(out);
          });
        });
      })
      .on("error", reject)
      .connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
  });
}

/** Format Date as YYYY-MM-DD */
function fmtDate(d) { return d.toISOString().split("T")[0]; }

/** Format Date as YYYY-MM-DD HH:MM:SS */
function fmtDT(d) { return d.toISOString().replace("T", " ").substring(0, 19); }

/** Random int in [min, max] */
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

/** Pick `count` random elements from `arr` */
function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------
const tokenCache = {};
const TOKEN_TTL_MS = 12 * 60 * 1000; // 12 min (JWT expires at 15)

async function getToken(email) {
  const cached = tokenCache[email];
  if (cached && Date.now() < cached.expiry) return cached.token;
  const result = await login(email, DEFAULT_PASSWORD);
  if (!result) { console.error(`    FAILED to login as ${email}`); return null; }
  tokenCache[email] = { token: result.token, expiry: Date.now() + TOKEN_TTL_MS };
  if (email === CEO_EMAIL) ceoToken = result.token;
  return result.token;
}

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------
let allUsers = [];
let ceoToken = null;
let ceoUser = null;
let orgId = null;
let leaveTypes = [];
let forumCategories = [];

const state = {
  leaveAppIds: [],        // all leave application IDs
  ticketIds: [],           // helpdesk ticket IDs
  surveyId: null,
  surveyQuestionIds: [],
  eventId: null,
  forumPostId: null,
  attendanceCounts: [0, 0, 0, 0, 0, 0, 0], // per day
};

function findByName(name) {
  return allUsers.find((u) => u.first_name.toLowerCase() === name.toLowerCase());
}
function findHR() {
  return allUsers.find((u) => u.role === "hr_manager") || ceoUser;
}
function nonCEO() {
  return allUsers.filter((u) => u.id !== ceoUser.id);
}

// ---------------------------------------------------------------------------
// Attendance via direct SQL
// ---------------------------------------------------------------------------

/**
 * Insert attendance records directly via MySQL for a given date.
 * @param {Date} targetDate - the date for these records
 * @param {Array} employees - array of user objects to check in
 * @param {number} checkInHourBase - base hour (e.g. 8 for 8:50-9:30)
 * @param {boolean} doCheckOut - whether to also insert check-out
 * @returns {number} count of records inserted
 */
async function insertAttendanceSQL(targetDate, employees, checkInHourBase, doCheckOut) {
  if (employees.length === 0) return 0;
  const dateStr = fmtDate(targetDate);

  // Build VALUES rows
  const rows = employees.map((emp, i) => {
    const ciMin = randInt(50, 90); // 50..90 mins after the base hour -> e.g., 8:50..9:30
    const ciH = checkInHourBase + Math.floor(ciMin / 60);
    const ciM = ciMin % 60;
    const ciS = randInt(0, 59);
    const checkIn = `${dateStr} ${String(ciH).padStart(2, "0")}:${String(ciM).padStart(2, "0")}:${String(ciS).padStart(2, "0")}`;

    let checkOut = "NULL";
    let workedMins = "NULL";
    let status = "present";
    if (doCheckOut) {
      const coH = randInt(17, 18); // 5:45-6:30 PM
      const coM = randInt(coH === 17 ? 45 : 0, coH === 18 ? 30 : 59);
      const coS = randInt(0, 59);
      checkOut = `'${dateStr} ${String(coH).padStart(2, "0")}:${String(coM).padStart(2, "0")}:${String(coS).padStart(2, "0")}'`;
      // Approximate worked minutes
      const worked = (coH * 60 + coM) - (ciH * 60 + ciM);
      workedMins = String(Math.max(0, worked));
      status = worked >= 480 ? "present" : worked >= 240 ? "half_day" : "present";
    }

    const lat = (12.9716 + Math.random() * 0.01).toFixed(7);
    const lng = (77.5946 + Math.random() * 0.01).toFixed(7);

    return `(${orgId}, ${emp.id}, '${dateStr}', '${checkIn}', ${checkOut}, 'manual', ${doCheckOut ? "'manual'" : "NULL"}, ${lat}, ${lng}, ${doCheckOut ? lat : "NULL"}, ${doCheckOut ? lng : "NULL"}, '${status}', ${workedMins}, 0, 0, 0, NULL, '${checkIn}', '${checkIn}')`;
  });

  // Delete any existing records for these users on this date first
  const userIds = employees.map((e) => e.id).join(",");
  const sql = `
DELETE FROM attendance_records WHERE organization_id=${orgId} AND date='${dateStr}' AND user_id IN (${userIds});
INSERT INTO attendance_records
  (organization_id, user_id, date, check_in, check_out, check_in_source, check_out_source, check_in_lat, check_in_lng, check_out_lat, check_out_lng, status, worked_minutes, overtime_minutes, late_minutes, early_departure_minutes, remarks, created_at, updated_at)
VALUES
  ${rows.join(",\n  ")};
`;

  try {
    await sshExecMySQL(sql);
    return employees.length;
  } catch (err) {
    console.error(`    SQL attendance insert failed: ${err.message}`);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
async function setup() {
  console.log("=== SETUP: Logging in as CEO and fetching org data ===\n");

  const ceoLogin = await login(CEO_EMAIL, DEFAULT_PASSWORD);
  if (!ceoLogin) throw new Error("Cannot login as CEO");
  ceoToken = ceoLogin.token;
  ceoUser = ceoLogin.user;
  orgId = ceoUser.organization_id || ceoUser.org_id;
  tokenCache[CEO_EMAIL] = { token: ceoToken, expiry: Date.now() + TOKEN_TTL_MS };

  console.log(`  CEO: ${ceoUser.first_name} ${ceoUser.last_name} (ID: ${ceoUser.id}, role: ${ceoUser.role})`);
  console.log(`  Org ID: ${orgId}\n`);

  // Fetch all users
  const usersRes = await api("GET", "/api/v1/users?per_page=100", null, ceoToken);
  if (usersRes.status < 400) allUsers = usersRes.body.data || [];
  console.log(`  Found ${allUsers.length} users:`);
  for (const u of allUsers) {
    console.log(`    ${u.id}: ${u.first_name} ${u.last_name} <${u.email}> [${u.role}]`);
  }
  console.log();

  // Fetch leave types
  const ltRes = await api("GET", "/api/v1/leave/types", null, ceoToken);
  if (ltRes.status < 400) leaveTypes = ltRes.body.data || [];
  if (leaveTypes.length === 0) {
    console.log("  Creating default leave types...");
    for (const t of [
      { name: "Casual Leave", code: "CL", is_paid: true },
      { name: "Sick Leave", code: "SL", is_paid: true },
      { name: "Earned Leave", code: "EL", is_paid: true, is_carry_forward: true, max_carry_forward_days: 10 },
    ]) {
      const r = await api("POST", "/api/v1/leave/types", t, ceoToken);
      if (r.status < 400) leaveTypes.push(r.body.data);
    }
  }
  console.log(`  Leave types: ${leaveTypes.map((t) => t.name).join(", ")}\n`);

  // Initialize leave balances
  const year = new Date().getFullYear();
  await api("POST", "/api/v1/leave/balances/initialize", { year }, ceoToken);

  // Fetch / create forum categories
  const fcRes = await api("GET", "/api/v1/forum/categories", null, ceoToken);
  if (fcRes.status < 400) forumCategories = fcRes.body.data || [];
  if (forumCategories.length === 0) {
    const fc = await api("POST", "/api/v1/forum/categories",
      { name: "General Discussion", description: "Open discussions for all employees" }, ceoToken);
    if (fc.status < 400) forumCategories = [fc.body.data];
  }

  // Clean up existing attendance for the 7-day window so simulation is fresh
  console.log("  Cleaning existing attendance records for the 7-day window...");
  const today = new Date();
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(fmtDate(d));
  }
  const dateList = dates.map((d) => `'${d}'`).join(",");
  try {
    await sshExecMySQL(
      `DELETE FROM attendance_records WHERE organization_id=${orgId} AND date IN (${dateList});`
    );
    console.log("  Cleaned!\n");
  } catch (err) {
    console.log(`  Warning: cleanup failed (${err.message}), continuing...\n`);
  }

  console.log("  Setup complete!\n");
}

// ---------------------------------------------------------------------------
// Date helper: get the Date object for each simulated day
// Day 1 = 6 days ago, Day 2 = 5 days ago, ..., Day 7 = today
// ---------------------------------------------------------------------------
function getDayDate(dayNum) {
  const d = new Date();
  d.setDate(d.getDate() - (7 - dayNum));
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// DAY 1: Monday -- Normal day
// ---------------------------------------------------------------------------
async function day1() {
  const dayDate = getDayDate(1);
  console.log("=".repeat(70));
  console.log(`DAY 1 (Monday ${fmtDate(dayDate)}): Normal day`);
  console.log("=".repeat(70));

  // All 20 check in + out
  console.log("\n  [1/5] All 20 employees check in & out...");
  const count = await insertAttendanceSQL(dayDate, allUsers, 8, true);
  state.attendanceCounts[0] = count;
  console.log(`    ${count} attendance records created`);

  // 2 leave applications
  console.log("\n  [2/5] 2 leave applications...");
  const applicants = pickRandom(nonCEO(), 2);
  const cl = leaveTypes.find((t) => t.code === "CL") || leaveTypes[0];
  const sl = leaveTypes.find((t) => t.code === "SL") || leaveTypes[1] || leaveTypes[0];

  // Leave dates: Day 2 (tomorrow in sim time)
  const leaveDate = getDayDate(2);
  for (let i = 0; i < applicants.length; i++) {
    const emp = applicants[i];
    const token = await getToken(emp.email);
    if (!token) continue;
    const lt = i === 0 ? cl : sl;
    const res = await api("POST", "/api/v1/leave/applications", {
      leave_type_id: lt.id,
      start_date: fmtDate(leaveDate),
      end_date: fmtDate(leaveDate),
      days_count: 1,
      is_half_day: false,
      reason: i === 0 ? "Family function to attend" : "Not feeling well, need rest",
    }, token);
    if (res.status < 400) {
      state.leaveAppIds.push(res.body.data.id);
      console.log(`    ${emp.first_name} applied for ${lt.name} (ID: ${res.body.data.id})`);
    }
  }

  // 1 helpdesk ticket from Anita
  console.log("\n  [3/5] Helpdesk ticket from Anita...");
  const anita = findByName("Anita") || nonCEO()[3];
  const anitaToken = await getToken(anita.email);
  if (anitaToken) {
    const res = await api("POST", "/api/v1/helpdesk/tickets", {
      category: "it", priority: "medium",
      subject: "Laptop keyboard not working properly",
      description: "My laptop keyboard has some keys that are not responding. The A and S keys require excessive force. Need IT support to check or replace.",
    }, anitaToken);
    if (res.status < 400) {
      state.ticketIds.push(res.body.data.id);
      console.log(`    Anita created ticket (ID: ${res.body.data.id})`);
    }
  }

  // HR announcement
  console.log("\n  [4/5] HR posting announcement...");
  const hr = findHR();
  const hrToken = await getToken(hr.email);
  await api("POST", "/api/v1/announcements", {
    title: "Welcome to Q2 2026 - New Initiatives",
    content: "Dear Team,\n\nWelcome to Q2! This quarter we are launching:\n\n1. Flexible WFH policy (2 days/week)\n2. New wellness program with gym memberships\n3. Quarterly team outings\n4. Skill development budget of INR 50,000/employee\n\nLet us make this our best quarter yet!\n\nBest regards,\nHR Team",
    priority: "high", target_type: "all",
  }, hrToken);
  console.log("    Announcement posted: Welcome to Q2 2026");

  console.log("\n  Day 1 complete!\n");
}

// ---------------------------------------------------------------------------
// DAY 2: Tuesday -- Leave day
// ---------------------------------------------------------------------------
async function day2() {
  const dayDate = getDayDate(2);
  console.log("=".repeat(70));
  console.log(`DAY 2 (Tuesday ${fmtDate(dayDate)}): Leave day`);
  console.log("=".repeat(70));

  // 18 check in (2 on leave)
  console.log("\n  [1/5] 18 employees check in (2 on leave)...");
  const onLeave = pickRandom(nonCEO(), 2);
  const onLeaveIds = new Set(onLeave.map((u) => u.id));
  const present = allUsers.filter((u) => !onLeaveIds.has(u.id));
  const count = await insertAttendanceSQL(dayDate, present, 8, true);
  state.attendanceCounts[1] = count;
  console.log(`    ${count} checked in. On leave: ${onLeave.map((u) => u.first_name).join(", ")}`);

  // HR approves Day 1 leaves
  console.log("\n  [2/5] HR approving Day 1 leave applications...");
  const hr = findHR();
  const hrToken = await getToken(hr.email);
  for (const appId of state.leaveAppIds.slice(0, 2)) {
    const res = await api("PUT", `/api/v1/leave/applications/${appId}/approve`,
      { remarks: "Approved. Enjoy your day off!" }, hrToken);
    if (res.status < 400) console.log(`    Approved leave ${appId}`);
  }

  // 3 new leave applications
  console.log("\n  [3/5] 3 new leave applications...");
  const newApplicants = pickRandom(nonCEO().filter((u) => !onLeaveIds.has(u.id)), 3);
  const nextWeek = new Date(dayDate); nextWeek.setDate(nextWeek.getDate() + 7);
  const reasons = [
    "Doctor appointment in the afternoon",
    "Personal commitment - house shifting",
    "Attending a wedding ceremony",
  ];
  for (let i = 0; i < newApplicants.length; i++) {
    const emp = newApplicants[i];
    const token = await getToken(emp.email);
    if (!token) continue;
    const lt = leaveTypes[i % leaveTypes.length];
    const sd = new Date(nextWeek); sd.setDate(sd.getDate() + i);
    const res = await api("POST", "/api/v1/leave/applications", {
      leave_type_id: lt.id,
      start_date: fmtDate(sd), end_date: fmtDate(sd),
      days_count: 1, is_half_day: false, reason: reasons[i],
    }, token);
    if (res.status < 400) {
      state.leaveAppIds.push(res.body.data.id);
      console.log(`    ${emp.first_name} applied for ${lt.name} (ID: ${res.body.data.id})`);
    }
  }

  // Assign Anita's ticket to Deepak (via HR)
  console.log("\n  [4/5] Assigning Anita's ticket to Deepak...");
  const deepak = findByName("Deepak");
  if (state.ticketIds.length > 0 && deepak) {
    await api("POST", `/api/v1/helpdesk/tickets/${state.ticketIds[0]}/assign`,
      { assigned_to: deepak.id }, hrToken);
    console.log(`    Ticket ${state.ticketIds[0]} assigned to Deepak`);
  }

  // Meera (via HR) creates pulse survey
  console.log("\n  [5/5] Creating pulse survey...");
  const surveyRes = await api("POST", "/api/v1/surveys", {
    title: "Q2 2026 Pulse Check - How Are You Feeling?",
    description: "A quick 3-question survey to understand team morale.",
    type: "pulse", is_anonymous: true, target_type: "all", recurrence: "none",
    questions: [
      { question_text: "How satisfied are you with your current role?", question_type: "rating_1_5", is_required: true, sort_order: 1 },
      { question_text: "Do you feel supported by your manager?", question_type: "yes_no", is_required: true, sort_order: 2 },
      { question_text: "What one thing would improve your work experience?", question_type: "text", is_required: false, sort_order: 3 },
    ],
  }, hrToken);

  if (surveyRes.status < 400) {
    state.surveyId = surveyRes.body.data.id;
    console.log(`    Survey created (ID: ${state.surveyId})`);
    await api("POST", `/api/v1/surveys/${state.surveyId}/publish`, {}, hrToken);
    console.log("    Survey published!");

    const det = await api("GET", `/api/v1/surveys/${state.surveyId}`, null, hrToken);
    if (det.status < 400 && det.body.data?.questions)
      state.surveyQuestionIds = det.body.data.questions.map((q) => q.id);
  }

  console.log("\n  Day 2 complete!\n");
}

// ---------------------------------------------------------------------------
// DAY 3: Wednesday -- Busy day
// ---------------------------------------------------------------------------
async function day3() {
  const dayDate = getDayDate(3);
  console.log("=".repeat(70));
  console.log(`DAY 3 (Wednesday ${fmtDate(dayDate)}): Busy day`);
  console.log("=".repeat(70));

  // 17 check in (3 on leave)
  console.log("\n  [1/6] 17 employees check in...");
  const onLeave = pickRandom(nonCEO(), 3);
  const onLeaveIds = new Set(onLeave.map((u) => u.id));
  const present = allUsers.filter((u) => !onLeaveIds.has(u.id));
  const count = await insertAttendanceSQL(dayDate, present, 8, true);
  state.attendanceCounts[2] = count;
  console.log(`    ${count} checked in. On leave: ${onLeave.map((u) => u.first_name).join(", ")}`);

  // Reject 1 leave
  console.log("\n  [2/6] Rejecting a leave application...");
  const hr = findHR();
  const hrToken = await getToken(hr.email);
  if (state.leaveAppIds.length > 2) {
    const rejectId = state.leaveAppIds[2];
    const res = await api("PUT", `/api/v1/leave/applications/${rejectId}/reject`, {
      remarks: "Sorry, critical project deadline. Please reschedule.",
    }, hrToken);
    if (res.status < 400) console.log(`    Leave ${rejectId} rejected`);
  }

  // Rohit creates VPN ticket
  console.log("\n  [3/6] Rohit creates helpdesk ticket (VPN)...");
  const rohit = findByName("Rohit") || nonCEO()[5];
  const rohitToken = await getToken(rohit.email);
  if (rohitToken) {
    const res = await api("POST", "/api/v1/helpdesk/tickets", {
      category: "it", priority: "high",
      subject: "VPN not connecting - unable to access internal systems",
      description: "VPN keeps timing out for the past hour. Tried restarting computer and router. Error: Connection timed out. Cannot access Jira or internal repos.",
    }, rohitToken);
    if (res.status < 400) {
      state.ticketIds.push(res.body.data.id);
      console.log(`    Rohit created ticket (ID: ${res.body.data.id})`);
    }
  }

  // 5 survey responses
  console.log("\n  [4/6] 5 employees respond to pulse survey...");
  if (state.surveyId && state.surveyQuestionIds.length > 0) {
    const respondents = pickRandom(nonCEO(), 5);
    const textOptions = [
      "More flexible hours would be great",
      "Better snacks in the cafeteria",
      "Regular team outings",
      "More learning opportunities",
      "Current setup works well",
    ];
    for (let ri = 0; ri < respondents.length; ri++) {
      const emp = respondents[ri];
      const token = await getToken(emp.email);
      if (!token) continue;
      const answers = state.surveyQuestionIds.map((qId, qi) => {
        if (qi === 0) return { question_id: qId, rating_value: randInt(3, 5) };
        if (qi === 1) return { question_id: qId, rating_value: Math.random() > 0.2 ? 1 : 0 };
        return { question_id: qId, text_value: textOptions[ri] };
      });
      const res = await api("POST", `/api/v1/surveys/${state.surveyId}/respond`, { answers }, token);
      if (res.status < 400) console.log(`    ${emp.first_name} responded`);
      await sleep(100);
    }
  }

  // Varun wellness check-in
  console.log("\n  [5/6] Varun does wellness check-in...");
  const varun = findByName("Varun") || nonCEO()[7];
  const varunToken = await getToken(varun.email);
  if (varunToken) {
    const res = await api("POST", "/api/v1/wellness/check-in", {
      mood: "good", energy_level: 4, sleep_hours: 7.5, exercise_minutes: 30,
      notes: "Productive morning workout. Feeling energetic!",
    }, varunToken);
    if (res.status < 400) console.log(`    ${varun.first_name} checked in (mood: good, energy: 4/5)`);
  }

  // CEO reviews dashboard
  console.log("\n  [6/6] CEO reviews attendance dashboard...");
  const t = await getToken(CEO_EMAIL);
  const dash = await api("GET", "/api/v1/attendance/dashboard", null, t);
  if (dash.status < 400 && dash.body.data) {
    const d = dash.body.data;
    console.log(`    Total employees: ${d.total_employees}, Present: ${d.present}, On leave: ${d.on_leave}`);
  }

  console.log("\n  Day 3 complete!\n");
}

// ---------------------------------------------------------------------------
// DAY 4: Thursday -- Team event
// ---------------------------------------------------------------------------
async function day4() {
  const dayDate = getDayDate(4);
  console.log("=".repeat(70));
  console.log(`DAY 4 (Thursday ${fmtDate(dayDate)}): Team event`);
  console.log("=".repeat(70));

  // All check in
  console.log("\n  [1/5] All employees check in...");
  const count = await insertAttendanceSQL(dayDate, allUsers, 8, true);
  state.attendanceCounts[3] = count;
  console.log(`    ${count} checked in`);

  // Priyanka (HR) creates Friday Fun event
  console.log("\n  [2/5] Creating Friday Fun event...");
  const hr = findHR();
  const hrToken = await getToken(hr.email);
  const friday = getDayDate(5);
  const eventRes = await api("POST", "/api/v1/events", {
    title: "Friday Fun - Team Building Games & Pizza Party",
    description: "Join us for an afternoon of fun!\n- 2:00 PM: Ice-breaker games\n- 3:00 PM: Inter-team quiz\n- 4:00 PM: Pizza & networking\n- 5:00 PM: Awards & wrap-up",
    event_type: "social",
    start_date: `${fmtDate(friday)}T14:00:00`,
    end_date: `${fmtDate(friday)}T17:00:00`,
    is_all_day: false,
    location: "NexGen Technologies - Main Conference Hall",
    target_type: "all", max_attendees: 25, is_mandatory: false,
  }, hrToken);
  if (eventRes.status < 400) {
    state.eventId = eventRes.body.data.id;
    console.log(`    Event created (ID: ${state.eventId})`);
  }

  // 3 anonymous feedback
  console.log("\n  [3/5] 3 employees submit anonymous feedback...");
  const fbEmployees = pickRandom(nonCEO(), 3);
  const feedbacks = [
    { category: "workplace", subject: "Office temperature too cold", message: "The AC on 3rd floor is set too low. Many of us bring jackets. Can we adjust to 24C?", sentiment: "negative" },
    { category: "suggestion", subject: "Standing desks for better health", message: "Standing desks would improve posture and productivity. Could the company provide adjustable standing desks?", sentiment: "positive" },
    { category: "management", subject: "More clarity on promotion criteria", message: "A published rubric would help everyone understand what is expected for promotions. Currently feels somewhat subjective.", sentiment: "neutral" },
  ];
  for (let i = 0; i < 3; i++) {
    const token = await getToken(fbEmployees[i].email);
    if (!token) continue;
    const res = await api("POST", "/api/v1/feedback", { ...feedbacks[i], is_urgent: false }, token);
    if (res.status < 400) console.log(`    Feedback: "${feedbacks[i].subject}"`);
  }

  // HR resolves Anita's ticket (Deepak can't - he's not HR)
  console.log("\n  [4/5] Resolving Anita's helpdesk ticket...");
  if (state.ticketIds.length > 0) {
    await api("POST", `/api/v1/helpdesk/tickets/${state.ticketIds[0]}/comment`, {
      comment: "Checked the laptop - keyboard membrane damaged. Replaced with new keyboard from inventory. Please test all keys.",
      is_internal: false,
    }, hrToken);
    const res = await api("POST", `/api/v1/helpdesk/tickets/${state.ticketIds[0]}/resolve`, {}, hrToken);
    if (res.status < 400) console.log(`    Ticket ${state.ticketIds[0]} resolved`);
  }

  // 2 leave applications for next week
  console.log("\n  [5/5] 2 leave applications for next week...");
  const leaveApps = pickRandom(nonCEO(), 2);
  const nextMon = new Date(dayDate); nextMon.setDate(nextMon.getDate() + 4);
  for (let i = 0; i < 2; i++) {
    const emp = leaveApps[i];
    const token = await getToken(emp.email);
    if (!token) continue;
    const lt = leaveTypes[i % leaveTypes.length];
    const sd = new Date(nextMon); sd.setDate(sd.getDate() + i * 2);
    const res = await api("POST", "/api/v1/leave/applications", {
      leave_type_id: lt.id, start_date: fmtDate(sd), end_date: fmtDate(sd),
      days_count: 1, is_half_day: false,
      reason: i === 0 ? "Visa appointment at the embassy" : "Moving to new apartment",
    }, token);
    if (res.status < 400) {
      state.leaveAppIds.push(res.body.data.id);
      console.log(`    ${emp.first_name} applied for ${lt.name} (ID: ${res.body.data.id})`);
    }
  }

  console.log("\n  Day 4 complete!\n");
}

// ---------------------------------------------------------------------------
// DAY 5: Friday -- Casual day
// ---------------------------------------------------------------------------
async function day5() {
  const dayDate = getDayDate(5);
  console.log("=".repeat(70));
  console.log(`DAY 5 (Friday ${fmtDate(dayDate)}): Casual day`);
  console.log("=".repeat(70));

  // 15 check in
  console.log("\n  [1/5] 15 employees check in (5 absent)...");
  const absent = pickRandom(nonCEO(), 5);
  const absentIds = new Set(absent.map((u) => u.id));
  const present = allUsers.filter((u) => !absentIds.has(u.id) || u.id === ceoUser.id);
  const count = await insertAttendanceSQL(dayDate, present, 9, true);
  state.attendanceCounts[4] = count;
  console.log(`    ${count} checked in. Absent: ${absent.map((u) => u.first_name).join(", ")}`);

  // 10 RSVP to Friday Fun
  console.log("\n  [2/5] 10 employees RSVP to Friday Fun...");
  if (state.eventId) {
    const rsvpers = pickRandom(allUsers, 10);
    for (const emp of rsvpers) {
      const token = await getToken(emp.email);
      if (!token) continue;
      const res = await api("POST", `/api/v1/events/${state.eventId}/rsvp`, { status: "attending" }, token);
      if (res.status < 400) console.log(`    ${emp.first_name} RSVP: attending`);
      await sleep(100);
    }
  }

  // Siddharth creates forum post
  console.log("\n  [3/5] Siddharth creates forum post...");
  const sid = findByName("Siddharth") || nonCEO()[9];
  const sidToken = await getToken(sid.email);
  if (sidToken && forumCategories.length > 0) {
    const res = await api("POST", "/api/v1/forum/posts", {
      category_id: forumCategories[0].id,
      title: "Tech Stack Discussion: Should we migrate to Next.js?",
      content: "Hey team,\n\nI have been exploring Next.js 15 and server components. Our React + Vite setup works well, but Next.js offers SSR, server actions, built-in caching.\n\nConcerns: migration effort for 50+ pages, learning curve, vendor lock-in.\n\nThoughts?",
      post_type: "discussion",
      tags: ["tech", "architecture", "nextjs"],
    }, sidToken);
    if (res.status < 400) {
      state.forumPostId = res.body.data.id;
      console.log(`    Forum post created (ID: ${state.forumPostId})`);
    }
  }

  // 3 replies
  console.log("\n  [4/5] 3 employees reply to forum post...");
  if (state.forumPostId) {
    const repliers = pickRandom(nonCEO().filter((u) => u.id !== sid.id), 3);
    const replies = [
      "Great topic! Used Next.js 14 in a side project. Server components are amazing but the mental model shift is real. Let us do a small PoC first.",
      "Skeptical about migration. Our Vite setup is blazing fast. ROI may not justify the effort. If we want SSR, Vite SSR plugin works.",
      "Count me in for the PoC! One thing: our Express backend is mature. Moving API routes to Next.js would be risky. Keep backend separate.",
    ];
    for (let i = 0; i < 3; i++) {
      const token = await getToken(repliers[i].email);
      if (!token) continue;
      const res = await api("POST", `/api/v1/forum/posts/${state.forumPostId}/reply`, { content: replies[i] }, token);
      if (res.status < 400) console.log(`    ${repliers[i].first_name} replied`);
    }
  }

  // HR runs attendance report
  console.log("\n  [5/5] HR runs attendance report...");
  const t = await getToken(CEO_EMAIL);
  const month = dayDate.getMonth() + 1;
  const year = dayDate.getFullYear();
  const rep = await api("GET", `/api/v1/attendance/monthly-report?month=${month}&year=${year}`, null, t);
  if (rep.status < 400) {
    const data = rep.body.data;
    if (data?.report) console.log(`    Report: ${data.report.length} employee records for ${month}/${year}`);
    else console.log(`    Report fetched`);
  }

  console.log("\n  Day 5 complete!\n");
}

// ---------------------------------------------------------------------------
// DAY 6: Saturday -- Off day
// ---------------------------------------------------------------------------
async function day6() {
  const dayDate = getDayDate(6);
  console.log("=".repeat(70));
  console.log(`DAY 6 (Saturday ${fmtDate(dayDate)}): Off day`);
  console.log("=".repeat(70));

  // 2 weekend workers
  console.log("\n  [1/2] 2 weekend workers check in...");
  const weekendWorkers = pickRandom(nonCEO(), 2);
  const count = await insertAttendanceSQL(dayDate, weekendWorkers, 10, true);
  state.attendanceCounts[5] = count;
  console.log(`    Weekend: ${weekendWorkers.map((u) => u.first_name).join(", ")}`);

  // Urgent ticket from Nikhil
  console.log("\n  [2/2] Nikhil creates urgent ticket...");
  const nikhil = findByName("Nikhil") || nonCEO()[10];
  const nikhilToken = await getToken(nikhil.email);
  if (nikhilToken) {
    const res = await api("POST", "/api/v1/helpdesk/tickets", {
      category: "it", priority: "urgent",
      subject: "URGENT: Production server showing 503 errors",
      description: "Production API returning 503 intermittently. Customer-facing services affected. Error rate ~40%. Need immediate DevOps attention!",
    }, nikhilToken);
    if (res.status < 400) {
      state.ticketIds.push(res.body.data.id);
      console.log(`    ${nikhil.first_name} created URGENT ticket (ID: ${res.body.data.id})`);
    }
  }

  console.log("\n  Day 6 complete!\n");
}

// ---------------------------------------------------------------------------
// DAY 7: Sunday -- Off day (quiet)
// ---------------------------------------------------------------------------
async function day7() {
  const dayDate = getDayDate(7);
  console.log("=".repeat(70));
  console.log(`DAY 7 (Sunday ${fmtDate(dayDate)}): Off day - Dashboard review`);
  console.log("=".repeat(70));

  console.log("\n  [1/2] No check-ins (Sunday)");
  state.attendanceCounts[6] = 0;

  console.log("\n  [2/2] CEO reviews weekly dashboard...\n");
  const t = await getToken(CEO_EMAIL);

  // Attendance
  const attDash = await api("GET", "/api/v1/attendance/dashboard", null, t);
  if (attDash.status < 400 && attDash.body.data) {
    const d = attDash.body.data;
    console.log("    --- Attendance Dashboard ---");
    for (const [k, v] of Object.entries(d)) { if (typeof v !== "object") console.log(`      ${k}: ${v}`); }
  }

  // Leave summary
  const lRes = await api("GET", "/api/v1/leave/applications?per_page=100", null, t);
  if (lRes.status < 400) {
    const apps = lRes.body.data || [];
    const pending = apps.filter((a) => a.status === "pending").length;
    const approved = apps.filter((a) => a.status === "approved").length;
    const rejected = apps.filter((a) => a.status === "rejected").length;
    console.log("\n    --- Leave Summary ---");
    console.log(`      Total: ${apps.length}, Pending: ${pending}, Approved: ${approved}, Rejected: ${rejected}`);
  }

  // Helpdesk
  const hdDash = await api("GET", "/api/v1/helpdesk/dashboard", null, t);
  if (hdDash.status < 400 && hdDash.body.data) {
    const d = hdDash.body.data;
    console.log("\n    --- Helpdesk Dashboard ---");
    for (const [k, v] of Object.entries(d)) { if (typeof v !== "object") console.log(`      ${k}: ${v}`); }
  }

  // Survey results
  if (state.surveyId) {
    const sr = await api("GET", `/api/v1/surveys/${state.surveyId}/results`, null, t);
    if (sr.status < 400 && sr.body.data) {
      const r = sr.body.data;
      console.log("\n    --- Pulse Survey Results ---");
      console.log(`      Responses: ${r.total_responses || "N/A"}`);
      if (r.questions) for (const q of r.questions) {
        console.log(`      Q: "${(q.question_text || "").substring(0, 50)}" -- Avg: ${q.average_rating || q.avg || "N/A"}`);
      }
    }
  }

  // Forum
  if (state.forumPostId) {
    const fp = await api("GET", `/api/v1/forum/posts/${state.forumPostId}`, null, t);
    if (fp.status < 400 && fp.body.data) {
      const p = fp.body.data;
      console.log("\n    --- Forum Highlight ---");
      console.log(`      Topic: "${p.title}"`);
      console.log(`      Views: ${p.view_count || 0}, Replies: ${(p.replies || []).length}, Likes: ${p.like_count || 0}`);
    }
  }

  // Widgets
  const w = await api("GET", "/api/v1/dashboard/widgets", null, t);
  if (w.status < 400 && w.body.data) {
    console.log("\n    --- Dashboard Widgets ---");
    for (const [k, v] of Object.entries(w.body.data)) {
      console.log(`      ${k}: ${typeof v === "object" ? JSON.stringify(v).substring(0, 80) : v}`);
    }
  }

  console.log("\n  Day 7 complete!\n");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
function printSummary() {
  const total = state.attendanceCounts.reduce((a, b) => a + b, 0);
  console.log("\n" + "=".repeat(70));
  console.log("                    7-DAY SIMULATION SUMMARY");
  console.log("=".repeat(70));
  console.log();
  console.log(`  Organization : NexGen Technologies (Org ID: ${orgId})`);
  console.log(`  CEO          : ${ceoUser.first_name} ${ceoUser.last_name} <${CEO_EMAIL}>`);
  console.log(`  Employees    : ${allUsers.length}`);
  console.log(`  Period       : ${fmtDate(getDayDate(1))} to ${fmtDate(getDayDate(7))}`);
  console.log();
  console.log("  Day-by-Day:");
  console.log("  " + "-".repeat(66));
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const actions = [
    "2 leaves, 1 ticket, 1 announcement",
    "2 approved, 3 leaves, 1 survey",
    "1 rejected, 1 ticket, 5 survey responses, 1 wellness",
    "1 event, 3 feedback, 1 ticket resolved, 2 leaves",
    "10 RSVPs, 1 forum post, 3 replies, report",
    "1 urgent ticket",
    "dashboard review",
  ];
  for (let i = 0; i < 7; i++) {
    console.log(`  Day ${i + 1} (${labels[i]} ${fmtDate(getDayDate(i + 1))}): ${state.attendanceCounts[i]} check-ins, ${actions[i]}`);
  }
  console.log("  " + "-".repeat(66));
  console.log();
  console.log("  Totals:");
  console.log(`    Attendance records created : ${total}`);
  console.log(`    Leave applications         : ${state.leaveAppIds.length}`);
  console.log(`    Helpdesk tickets           : ${state.ticketIds.length}`);
  console.log(`    Survey                     : ${state.surveyId ? "Yes (ID: " + state.surveyId + ")" : "No"}`);
  console.log(`    Event                      : ${state.eventId ? "Yes (ID: " + state.eventId + ")" : "No"}`);
  console.log(`    Forum post                 : ${state.forumPostId ? "Yes (ID: " + state.forumPostId + ")" : "No"}`);
  console.log(`    Anonymous feedback          : 3`);
  console.log(`    Wellness check-ins          : 1`);
  console.log();
  console.log("=".repeat(70));
  console.log("  SIMULATION COMPLETE!");
  console.log("=".repeat(70) + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("  EMP CLOUD -- 7-Day NexGen Technologies HR Simulation");
  console.log("  Server: " + API_BASE);
  console.log("  Date  : " + new Date().toISOString().split("T")[0]);
  console.log("=".repeat(70) + "\n");

  try {
    await setup();
    if (allUsers.length < 2) { console.error("Not enough users. Aborting."); process.exit(1); }

    await day1(); await sleep(300);
    await day2(); await sleep(300);
    await day3(); await sleep(300);
    await day4(); await sleep(300);
    await day5(); await sleep(300);
    await day6(); await sleep(300);
    await day7();

    printSummary();
  } catch (err) {
    console.error("\nFATAL ERROR:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
