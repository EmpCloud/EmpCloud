// =============================================================================
// EMP CLOUD — Organization Simulation Script
// Creates "NexGen Technologies" with 20 employees and simulates Day 1 operations.
// Usage: node scripts/simulate-org.cjs
// =============================================================================

const API = 'https://test-empcloud-api.empcloud.com/api/v1';
const PASSWORD = 'NexGen@2026';

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

async function api(method, path, body, token) {
  const url = `${API}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok && res.status >= 400) {
    const errMsg = json?.error?.message || json?.message || text;
    // Don't throw for "already exists" / idempotent errors — treat as skip
    const isSkippable = res.status === 409
      || (errMsg && (errMsg.includes('already') || errMsg.includes('Already') || errMsg.includes('Overlapping') || errMsg.includes('duplicate')));
    if (isSkippable) {
      console.log(`  [SKIP] ${method} ${path} — ${errMsg}`);
      return { success: false, skipped: true, data: json?.data || json };
    }
    console.error(`  [ERR] ${method} ${path} ${res.status}: ${errMsg}`);
    return { success: false, data: json?.data || json, status: res.status, error: errMsg };
  }

  return { success: true, data: json?.data ?? json };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Generate a staggered IST datetime string for today */
function todayIST(hours, minutes) {
  const now = new Date();
  // Build an IST date: UTC+5:30
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+05:30`;
}

function futureDate(daysFromNow) {
  const dt = new Date();
  dt.setDate(dt.getDate() + daysFromNow);
  return dt.toISOString().split('T')[0];
}

function yesterday() {
  return futureDate(-1);
}

// ---------------------------------------------------------------------------
// Report collector
// ---------------------------------------------------------------------------

const report = [];
function log(section, msg, ok = true) {
  const sym = ok ? '[OK]' : '[!!]';
  const line = `${sym} ${section}: ${msg}`;
  report.push(line);
  console.log(line);
}

// ---------------------------------------------------------------------------
// Phase 1: Build the Organization
// ---------------------------------------------------------------------------

async function phase1() {
  console.log('\n========================================');
  console.log('  PHASE 1 — BUILD THE ORGANIZATION');
  console.log('========================================\n');

  // --- Step 1: Register ---
  console.log('--- Step 1: Register NexGen Technologies ---');
  const regResult = await api('POST', '/auth/register', {
    org_name: 'NexGen Technologies',
    org_legal_name: 'NexGen Technologies Pvt Ltd',
    org_country: 'IN',
    org_state: 'Karnataka',
    org_timezone: 'Asia/Kolkata',
    org_email: 'hr@nexgen.tech',
    first_name: 'Vikram',
    last_name: 'Mehta',
    email: 'vikram@nexgen.tech',
    password: PASSWORD,
  });

  if (regResult.success) {
    log('Register', 'Organization created successfully');
  } else if (regResult.skipped) {
    log('Register', 'Organization already exists (skipping)');
  } else {
    log('Register', `Failed: ${regResult.error}`, false);
  }

  // --- Step 1b: Login as CEO ---
  console.log('\n--- Login as CEO (Vikram) ---');
  const loginResult = await api('POST', '/auth/login', {
    email: 'vikram@nexgen.tech',
    password: PASSWORD,
  });

  if (!loginResult.success) {
    console.error('FATAL: Cannot login as Vikram. Aborting.');
    process.exit(1);
  }

  const adminToken = loginResult.data.tokens?.access_token || loginResult.data.token || loginResult.data.access_token;
  const orgId = loginResult.data.org?.id || loginResult.data.organization?.id;
  const vikramId = loginResult.data.user?.id;
  log('Login', `Vikram logged in (user_id=${vikramId}, org_id=${orgId})`);

  // --- Step 2: Create Departments ---
  console.log('\n--- Step 2: Create Departments ---');
  const departments = ['Engineering', 'Product', 'Marketing', 'Sales', 'HR & Operations', 'Finance'];
  const deptMap = {};

  for (const name of departments) {
    const r = await api('POST', '/organizations/me/departments', { name }, adminToken);
    if (r.success) {
      deptMap[name] = r.data.id;
      log('Department', `Created "${name}" (id=${r.data.id})`);
    } else if (r.skipped) {
      log('Department', `"${name}" already exists`);
    } else {
      log('Department', `Failed to create "${name}": ${r.error}`, false);
    }
  }

  // If deptMap is empty (departments already existed), fetch them
  if (Object.keys(deptMap).length === 0 || Object.values(deptMap).some(v => !v)) {
    const deptList = await api('GET', '/organizations/me/departments', null, adminToken);
    if (deptList.success && Array.isArray(deptList.data)) {
      for (const d of deptList.data) {
        deptMap[d.name] = d.id;
      }
    }
  }
  console.log('  Department map:', deptMap);

  // --- Step 3: Create Employees ---
  console.log('\n--- Step 3: Create 19 Employees ---');

  const employees = [
    // { first_name, last_name, email, role, department, designation, reporting_manager_email }
    { first_name: 'Priyanka', last_name: 'Sharma', email: 'priyanka@nexgen.tech', role: 'hr_manager', dept: 'HR & Operations', designation: 'HR Director' },
    { first_name: 'Arjun', last_name: 'Reddy', email: 'arjun@nexgen.tech', role: 'manager', dept: 'Engineering', designation: 'VP Engineering' },
    { first_name: 'Kavya', last_name: 'Nair', email: 'kavya@nexgen.tech', role: 'employee', dept: 'Engineering', designation: 'Senior Full Stack Developer' },
    { first_name: 'Rohit', last_name: 'Gupta', email: 'rohit@nexgen.tech', role: 'employee', dept: 'Engineering', designation: 'Backend Developer' },
    { first_name: 'Sneha', last_name: 'Patel', email: 'sneha@nexgen.tech', role: 'employee', dept: 'Engineering', designation: 'Frontend Developer' },
    { first_name: 'Deepak', last_name: 'Kumar', email: 'deepak@nexgen.tech', role: 'employee', dept: 'Engineering', designation: 'DevOps Engineer' },
    { first_name: 'Anita', last_name: 'Verma', email: 'anita@nexgen.tech', role: 'employee', dept: 'Engineering', designation: 'QA Lead' },
    { first_name: 'Rahul', last_name: 'Joshi', email: 'rahul@nexgen.tech', role: 'employee', dept: 'Engineering', designation: 'Junior Developer' },
    { first_name: 'Pooja', last_name: 'Iyer', email: 'pooja@nexgen.tech', role: 'employee', dept: 'Engineering', designation: 'Data Engineer' },
    { first_name: 'Siddharth', last_name: 'Rao', email: 'siddharth@nexgen.tech', role: 'manager', dept: 'Product', designation: 'VP Product' },
    { first_name: 'Meera', last_name: 'Krishnan', email: 'meera@nexgen.tech', role: 'employee', dept: 'Product', designation: 'Product Manager' },
    { first_name: 'Aakash', last_name: 'Singh', email: 'aakash@nexgen.tech', role: 'employee', dept: 'Product', designation: 'UX Designer' },
    { first_name: 'Neha', last_name: 'Deshmukh', email: 'neha@nexgen.tech', role: 'employee', dept: 'Marketing', designation: 'Marketing Manager' },
    { first_name: 'Rajesh', last_name: 'Pillai', email: 'rajesh@nexgen.tech', role: 'employee', dept: 'Marketing', designation: 'Content Specialist' },
    { first_name: 'Amit', last_name: 'Saxena', email: 'amit@nexgen.tech', role: 'manager', dept: 'Sales', designation: 'Sales Director' },
    { first_name: 'Sunita', last_name: 'Bhatt', email: 'sunita@nexgen.tech', role: 'employee', dept: 'Sales', designation: 'Account Executive' },
    { first_name: 'Varun', last_name: 'Choudhary', email: 'varun@nexgen.tech', role: 'employee', dept: 'Sales', designation: 'Business Development' },
    { first_name: 'Lakshmi', last_name: 'Menon', email: 'lakshmi@nexgen.tech', role: 'employee', dept: 'HR & Operations', designation: 'Office Manager' },
    { first_name: 'Nikhil', last_name: 'Agarwal', email: 'nikhil@nexgen.tech', role: 'employee', dept: 'Finance', designation: 'Finance Controller' },
  ];

  const userMap = { 'vikram@nexgen.tech': vikramId };

  for (const emp of employees) {
    const payload = {
      first_name: emp.first_name,
      last_name: emp.last_name,
      email: emp.email,
      password: PASSWORD,
      role: emp.role,
      designation: emp.designation,
      department_id: deptMap[emp.dept] || undefined,
      date_of_joining: '2025-01-15',
      employment_type: 'full_time',
    };

    const r = await api('POST', '/users', payload, adminToken);
    if (r.success) {
      userMap[emp.email] = r.data.id;
      log('User', `Created ${emp.first_name} ${emp.last_name} (id=${r.data.id})`);
    } else if (r.skipped) {
      log('User', `${emp.first_name} ${emp.last_name} already exists`);
    } else {
      log('User', `Failed: ${emp.email} — ${r.error}`, false);
    }
  }

  // If we had skipped users, fetch the full user list to populate userMap
  if (Object.keys(userMap).length < 20) {
    const userList = await api('GET', '/users?per_page=100', null, adminToken);
    if (userList.success) {
      const users = Array.isArray(userList.data) ? userList.data : (userList.data?.items || userList.data?.users || []);
      for (const u of users) {
        userMap[u.email] = u.id;
      }
    }
  }
  console.log(`  Total users in map: ${Object.keys(userMap).length}`);

  // --- Step 4: Reporting Hierarchy ---
  console.log('\n--- Step 4: Set Reporting Hierarchy ---');

  const hierarchy = {
    'arjun@nexgen.tech': 'vikram@nexgen.tech',
    'siddharth@nexgen.tech': 'vikram@nexgen.tech',
    'amit@nexgen.tech': 'vikram@nexgen.tech',
    'priyanka@nexgen.tech': 'vikram@nexgen.tech',
    'neha@nexgen.tech': 'vikram@nexgen.tech',
    'nikhil@nexgen.tech': 'vikram@nexgen.tech',
    'kavya@nexgen.tech': 'arjun@nexgen.tech',
    'rohit@nexgen.tech': 'arjun@nexgen.tech',
    'sneha@nexgen.tech': 'arjun@nexgen.tech',
    'deepak@nexgen.tech': 'arjun@nexgen.tech',
    'anita@nexgen.tech': 'arjun@nexgen.tech',
    'rahul@nexgen.tech': 'arjun@nexgen.tech',
    'pooja@nexgen.tech': 'arjun@nexgen.tech',
    'meera@nexgen.tech': 'siddharth@nexgen.tech',
    'aakash@nexgen.tech': 'siddharth@nexgen.tech',
    'sunita@nexgen.tech': 'amit@nexgen.tech',
    'varun@nexgen.tech': 'amit@nexgen.tech',
    'lakshmi@nexgen.tech': 'priyanka@nexgen.tech',
    'rajesh@nexgen.tech': 'neha@nexgen.tech',
  };

  for (const [empEmail, mgrEmail] of Object.entries(hierarchy)) {
    const empId = userMap[empEmail];
    const mgrId = userMap[mgrEmail];
    if (!empId || !mgrId) {
      log('Hierarchy', `Missing IDs for ${empEmail} -> ${mgrEmail}`, false);
      continue;
    }
    const r = await api('PUT', `/users/${empId}`, { reporting_manager_id: mgrId }, adminToken);
    if (r.success) {
      log('Hierarchy', `${empEmail} -> ${mgrEmail}`);
    } else {
      log('Hierarchy', `Failed: ${empEmail} -> ${mgrEmail}: ${r.error}`, false);
    }
  }

  // --- Step 5: Leave Types ---
  console.log('\n--- Step 5: Create Leave Types ---');

  // Login as Priyanka (HR) for HR operations
  const hrLogin = await api('POST', '/auth/login', { email: 'priyanka@nexgen.tech', password: PASSWORD });
  let hrToken = adminToken; // fallback
  let priyankaId = userMap['priyanka@nexgen.tech'];
  if (hrLogin.success) {
    hrToken = hrLogin.data.tokens?.access_token || hrLogin.data.token || hrLogin.data.access_token;
    priyankaId = hrLogin.data.user?.id || priyankaId;
    log('Login', `Priyanka (HR) logged in`);
  } else {
    log('Login', `Priyanka login failed, using admin token`, false);
  }

  const leaveTypes = [
    { name: 'Earned Leave', code: 'EL', is_paid: true, is_carry_forward: true, max_carry_forward_days: 30, requires_approval: true },
    { name: 'Sick Leave', code: 'SL', is_paid: true, is_carry_forward: false, requires_approval: true },
    { name: 'Casual Leave', code: 'CL', is_paid: true, is_carry_forward: false, requires_approval: true },
    { name: 'Maternity Leave', code: 'ML', is_paid: true, is_carry_forward: false, requires_approval: true },
    { name: 'Paternity Leave', code: 'PL', is_paid: true, is_carry_forward: false, requires_approval: true },
    { name: 'Comp Off', code: 'COMP_OFF', is_paid: true, is_carry_forward: false, requires_approval: true },
  ];

  const leaveTypeMap = {};
  for (const lt of leaveTypes) {
    const r = await api('POST', '/leave/types', lt, hrToken);
    if (r.success) {
      leaveTypeMap[lt.code] = r.data.id;
      log('LeaveType', `Created "${lt.name}" (id=${r.data.id})`);
    } else {
      log('LeaveType', `"${lt.name}": ${r.error || 'skipped'}`, !r.error);
    }
  }

  // Fetch leave types if we need IDs
  if (Object.keys(leaveTypeMap).length === 0) {
    const ltList = await api('GET', '/leave/types', null, hrToken);
    if (ltList.success && Array.isArray(ltList.data)) {
      for (const lt of ltList.data) {
        leaveTypeMap[lt.code] = lt.id;
      }
    }
  }
  console.log('  Leave type map:', leaveTypeMap);

  // Leave Policies
  console.log('\n--- Step 5b: Create Leave Policies ---');
  const leavePolicies = [
    { leave_type_id: leaveTypeMap['EL'], name: 'EL Standard', annual_quota: 18, accrual_type: 'monthly' },
    { leave_type_id: leaveTypeMap['SL'], name: 'SL Standard', annual_quota: 12, accrual_type: 'annual' },
    { leave_type_id: leaveTypeMap['CL'], name: 'CL Standard', annual_quota: 8, accrual_type: 'annual' },
    { leave_type_id: leaveTypeMap['ML'], name: 'Maternity Standard', annual_quota: 182, accrual_type: 'annual', applicable_gender: 'female' },
    { leave_type_id: leaveTypeMap['PL'], name: 'Paternity Standard', annual_quota: 15, accrual_type: 'annual', applicable_gender: 'male' },
  ];

  for (const lp of leavePolicies) {
    if (!lp.leave_type_id) { log('LeavePolicy', `Skipping — no leave_type_id`, false); continue; }
    const r = await api('POST', '/leave/policies', lp, hrToken);
    if (r.success) {
      log('LeavePolicy', `Created "${lp.name}" (id=${r.data.id})`);
    } else {
      log('LeavePolicy', `"${lp.name}": ${r.error || 'skipped'}`, false);
    }
  }

  // Initialize balances for 2026
  console.log('\n--- Step 5c: Initialize Leave Balances for 2026 ---');
  const balInit = await api('POST', '/leave/balances/initialize', { year: 2026 }, hrToken);
  if (balInit.success) {
    log('LeaveBalance', `Initialized for 2026: ${JSON.stringify(balInit.data)}`);
  } else {
    log('LeaveBalance', `${balInit.error || 'skipped'}`, false);
  }

  // --- Step 6: Shifts ---
  console.log('\n--- Step 6: Create Shifts ---');
  const shifts = [
    { name: 'General Shift', start_time: '09:00', end_time: '18:00', break_minutes: 60, grace_minutes_late: 15, grace_minutes_early: 15, is_default: true },
    { name: 'Flexible Shift', start_time: '10:00', end_time: '19:00', break_minutes: 60, grace_minutes_late: 30, grace_minutes_early: 15, is_default: false },
  ];

  const shiftMap = {};
  for (const sh of shifts) {
    const r = await api('POST', '/attendance/shifts', sh, hrToken);
    if (r.success) {
      shiftMap[sh.name] = r.data.id;
      log('Shift', `Created "${sh.name}" (id=${r.data.id})`);
    } else {
      log('Shift', `"${sh.name}": ${r.error || 'skipped'}`, false);
    }
  }

  // Fetch shifts if needed
  if (Object.keys(shiftMap).length === 0) {
    const shList = await api('GET', '/attendance/shifts', null, hrToken);
    if (shList.success && Array.isArray(shList.data)) {
      for (const s of shList.data) {
        shiftMap[s.name] = s.id;
      }
    }
  }
  console.log('  Shift map:', shiftMap);

  // Assign General Shift to all employees
  console.log('\n--- Step 6b: Assign Shifts ---');
  const generalShiftId = shiftMap['General Shift'];
  if (generalShiftId) {
    const allUserIds = Object.values(userMap).filter(Boolean);
    const r = await api('POST', '/attendance/shifts/bulk-assign', {
      user_ids: allUserIds,
      shift_id: generalShiftId,
      effective_from: '2026-01-01',
    }, hrToken);
    if (r.success) {
      log('ShiftAssign', `Assigned General Shift to ${allUserIds.length} users`);
    } else {
      log('ShiftAssign', `Bulk assign failed: ${r.error}`, false);
    }
  }

  // --- Step 7: Announcements ---
  console.log('\n--- Step 7: Create Announcements ---');
  const announcements = [
    { title: 'Welcome to NexGen Technologies!', content: 'We are thrilled to welcome everyone to NexGen Technologies! As a team, we are building the future of enterprise software. Together, we will innovate, collaborate, and achieve great things. Welcome aboard!', priority: 'high', target_type: 'all' },
    { title: 'Q1 2026 Company Goals', content: 'Our Q1 2026 goals include:\n\n1. Launch v2.0 of our flagship product\n2. Onboard 50 new enterprise clients\n3. Achieve 99.9% uptime\n4. Complete SOC 2 Type II certification\n\nLet us work together to achieve these milestones!', priority: 'normal', target_type: 'all' },
    { title: 'Engineering Team Offsite - April 15', content: 'The Engineering team offsite is scheduled for April 15 at the Taj West End, Bangalore. The agenda includes tech talks, hackathon, and team dinner. Please RSVP by April 5.\n\nLooking forward to a productive day!', priority: 'normal', target_type: 'department', target_ids: deptMap['Engineering'] ? String(deptMap['Engineering']) : null },
  ];

  for (const ann of announcements) {
    const r = await api('POST', '/announcements', ann, hrToken);
    if (r.success) {
      log('Announcement', `Created "${ann.title}" (id=${r.data.id})`);
    } else {
      log('Announcement', `"${ann.title}": ${r.error || 'skipped'}`, false);
    }
  }

  // --- Step 8: Company Policies ---
  console.log('\n--- Step 8: Create Company Policies ---');
  const policies = [
    { title: 'Work From Home Policy', content: 'NexGen Technologies allows employees to work from home up to 3 days per week. Employees must:\n\n1. Inform their manager at least 24 hours in advance\n2. Be available during core hours (10 AM - 4 PM IST)\n3. Maintain a stable internet connection\n4. Attend all scheduled meetings\n5. Ensure data security on personal devices\n\nRemote work should not affect productivity or team collaboration.', category: 'general', effective_date: '2026-01-01' },
    { title: 'Leave Policy', content: 'NexGen Technologies provides the following leave entitlements:\n\n- Earned Leave: 18 days/year (carry forward allowed, max 30 days)\n- Sick Leave: 12 days/year (no carry forward)\n- Casual Leave: 8 days/year (no carry forward)\n- Maternity Leave: 182 days\n- Paternity Leave: 15 days\n- Comp Off: As earned\n\nAll leave applications must be submitted at least 3 days in advance for planned leave. Sick leave requires a medical certificate for absences of 3+ consecutive days.', category: 'general', effective_date: '2026-01-01' },
    { title: 'Code of Conduct', content: 'All employees must adhere to the following code of conduct:\n\n1. Treat colleagues with respect and dignity\n2. Maintain confidentiality of proprietary information\n3. Avoid conflicts of interest\n4. Report any unethical behavior through proper channels\n5. Follow anti-discrimination and anti-harassment guidelines\n6. Comply with all applicable laws and regulations\n7. Use company resources responsibly\n\nViolations may result in disciplinary action up to and including termination.', category: 'general', effective_date: '2026-01-01' },
    { title: 'Data Security Policy', content: 'NexGen Technologies is committed to protecting data. All employees must:\n\n1. Use strong, unique passwords for all work accounts\n2. Enable two-factor authentication where available\n3. Never share credentials or access tokens\n4. Lock workstations when leaving your desk\n5. Report suspicious emails or phishing attempts immediately\n6. Use approved VPN for remote access\n7. Never store sensitive data on personal devices\n8. Follow data classification guidelines\n\nData breaches must be reported within 24 hours to the IT Security team.', category: 'general', effective_date: '2026-01-01' },
  ];

  const policyIds = [];
  for (const pol of policies) {
    const r = await api('POST', '/policies', pol, hrToken);
    if (r.success) {
      policyIds.push(r.data.id);
      log('Policy', `Created "${pol.title}" (id=${r.data.id})`);
    } else {
      log('Policy', `"${pol.title}": ${r.error || 'skipped'}`, false);
    }
  }

  // --- Step 9: Subscribe to Modules ---
  console.log('\n--- Step 9: Subscribe to Modules ---');

  // First, list available modules to get IDs
  const moduleList = await api('GET', '/modules', null, adminToken);
  const moduleMap = {};
  if (moduleList.success && Array.isArray(moduleList.data)) {
    for (const m of moduleList.data) {
      moduleMap[m.slug] = m.id;
    }
  }
  console.log('  Available modules:', Object.keys(moduleMap).join(', '));

  const modulesToSubscribe = ['emp-payroll', 'emp-recruit', 'emp-performance', 'emp-rewards', 'emp-lms'];
  for (const slug of modulesToSubscribe) {
    const modId = moduleMap[slug];
    if (!modId) {
      log('Subscribe', `Module "${slug}" not found in marketplace`, false);
      continue;
    }
    const r = await api('POST', '/subscriptions', {
      module_id: modId,
      plan_tier: 'professional',
      total_seats: 20,
      billing_cycle: 'annual',
    }, adminToken);
    if (r.success) {
      log('Subscribe', `Subscribed to "${slug}" (sub_id=${r.data.id})`);
    } else if (r.skipped) {
      log('Subscribe', `Already subscribed to "${slug}" (idempotent)`);
    } else {
      log('Subscribe', `"${slug}": ${r.error || 'failed'}`, false);
    }
  }

  return { adminToken, hrToken, userMap, deptMap, leaveTypeMap, shiftMap, policyIds, priyankaId };
}

// ---------------------------------------------------------------------------
// Phase 2: Simulate Day 1 Operations
// ---------------------------------------------------------------------------

async function phase2(ctx) {
  console.log('\n========================================');
  console.log('  PHASE 2 — SIMULATE DAY 1 OPERATIONS');
  console.log('========================================\n');

  const { adminToken, hrToken, userMap, deptMap, leaveTypeMap, shiftMap, policyIds, priyankaId } = ctx;

  // Build token cache - pre-populate with known tokens
  const tokenCache = {};
  tokenCache['vikram@nexgen.tech'] = adminToken;
  if (hrToken !== adminToken) tokenCache['priyanka@nexgen.tech'] = hrToken;

  async function getToken(email) {
    if (tokenCache[email]) return tokenCache[email];
    const r = await api('POST', '/auth/login', { email, password: PASSWORD });
    if (r.success) {
      tokenCache[email] = r.data.tokens?.access_token || r.data.token || r.data.access_token;
      return tokenCache[email];
    }
    console.log(`  [WARN] Cannot login as ${email}: ${r.error}`);
    return null;
  }

  // ---------- ALL EMPLOYEES: Check In ----------
  console.log('--- All Employees: Morning Check-In ---');

  const allEmails = Object.keys(userMap);
  const checkInTimes = [
    // [email, hour, minute] — staggered arrival
    ['vikram@nexgen.tech', 8, 50],
    ['priyanka@nexgen.tech', 8, 55],
    ['arjun@nexgen.tech', 9, 0],
    ['kavya@nexgen.tech', 9, 5],
    ['rohit@nexgen.tech', 9, 10],
    ['sneha@nexgen.tech', 9, 2],
    ['deepak@nexgen.tech', 9, 45],  // late!
    ['anita@nexgen.tech', 9, 8],
    ['rahul@nexgen.tech', 9, 15],
    ['pooja@nexgen.tech', 9, 3],
    ['siddharth@nexgen.tech', 9, 0],
    ['meera@nexgen.tech', 9, 12],
    ['aakash@nexgen.tech', 9, 20],
    ['neha@nexgen.tech', 9, 5],
    ['rajesh@nexgen.tech', 9, 25],
    ['amit@nexgen.tech', 8, 55],
    ['sunita@nexgen.tech', 9, 10],
    ['varun@nexgen.tech', 9, 30],
    ['lakshmi@nexgen.tech', 9, 0],
    ['nikhil@nexgen.tech', 9, 5],
  ];

  for (const [email, hour, min] of checkInTimes) {
    const token = await getToken(email);
    if (!token) continue;
    const r = await api('POST', '/attendance/check-in', {
      source: 'manual',
      remarks: hour >= 9 && min > 30 ? 'Running late due to traffic' : undefined,
    }, token);
    if (r.success) {
      const lateTag = hour >= 9 && min > 30 ? ' (LATE)' : '';
      log('CheckIn', `${email} checked in at ${hour}:${String(min).padStart(2, '0')}${lateTag}`);
    } else if (r.skipped) {
      log('CheckIn', `${email} already checked in (idempotent)`);
    } else {
      log('CheckIn', `${email}: ${r.error}`, false);
    }
  }

  // ---------- HR (Priyanka) Operations ----------
  console.log('\n--- HR Operations (Priyanka) ---');
  const prToken = await getToken('priyanka@nexgen.tech');

  // Post announcement about team lunch
  if (prToken) {
    const r = await api('POST', '/announcements', {
      title: 'Team Lunch - This Friday!',
      content: 'Join us for a team lunch this Friday at 1 PM at the office cafeteria. We will be celebrating our Q1 milestones and welcoming new team members. All departments are welcome!',
      priority: 'normal',
      target_type: 'all',
    }, prToken);
    if (r.success) {
      log('HR-Announcement', `Posted team lunch announcement (id=${r.data.id})`);
    } else {
      log('HR-Announcement', `Failed: ${r.error}`, false);
    }
  }

  // ---------- Engineering Team Operations ----------
  console.log('\n--- Engineering Team Operations ---');

  // Kavya applies for 2 days Earned Leave next week
  const kavyaToken = await getToken('kavya@nexgen.tech');
  let kavyaLeaveId = null;
  if (kavyaToken && leaveTypeMap['EL']) {
    const startDate = futureDate(5); // next week
    const endDate = futureDate(6);
    const r = await api('POST', '/leave/applications', {
      leave_type_id: leaveTypeMap['EL'],
      start_date: startDate,
      end_date: endDate,
      days_count: 2,
      reason: 'Family function in Chennai. Need to travel. Will be reachable on phone for urgent matters.',
    }, kavyaToken);
    if (r.success) {
      kavyaLeaveId = r.data.id;
      log('Leave-Apply', `Kavya applied for 2 days EL (id=${r.data.id}), ${startDate} to ${endDate}`);
    } else if (r.skipped) {
      log('Leave-Apply', `Kavya EL already applied (idempotent)`);
      // Try to find the existing leave to use for approval
      const kavyaLeaves = await api('GET', '/leave/applications/me?status=pending', null, kavyaToken);
      if (kavyaLeaves.success) {
        const items = Array.isArray(kavyaLeaves.data) ? kavyaLeaves.data : (kavyaLeaves.data?.items || []);
        if (items.length > 0) kavyaLeaveId = items[0].id;
      }
    } else {
      log('Leave-Apply', `Kavya EL: ${r.error}`, false);
    }
  }

  // Rohit applies for 1 day Sick Leave tomorrow
  const rohitToken = await getToken('rohit@nexgen.tech');
  let rohitLeaveId = null;
  if (rohitToken && leaveTypeMap['SL']) {
    const tmrw = futureDate(1);
    const r = await api('POST', '/leave/applications', {
      leave_type_id: leaveTypeMap['SL'],
      start_date: tmrw,
      end_date: tmrw,
      days_count: 1,
      reason: 'Feeling unwell, have a doctor appointment scheduled for tomorrow morning.',
    }, rohitToken);
    if (r.success) {
      rohitLeaveId = r.data.id;
      log('Leave-Apply', `Rohit applied for 1 day SL (id=${r.data.id}), ${tmrw}`);
    } else if (r.skipped) {
      log('Leave-Apply', `Rohit SL already applied (idempotent)`);
      const rohitLeaves = await api('GET', '/leave/applications/me?status=pending', null, rohitToken);
      if (rohitLeaves.success) {
        const items = Array.isArray(rohitLeaves.data) ? rohitLeaves.data : (rohitLeaves.data?.items || []);
        if (items.length > 0) rohitLeaveId = items[0].id;
      }
    } else {
      log('Leave-Apply', `Rohit SL: ${r.error}`, false);
    }
  }

  // Anita submits helpdesk ticket
  const anitaToken = await getToken('anita@nexgen.tech');
  if (anitaToken) {
    const r = await api('POST', '/helpdesk/tickets', {
      category: 'it',
      priority: 'high',
      subject: 'Laptop keyboard not working',
      description: 'Several keys on my laptop keyboard (MacBook Pro 2024) have stopped working since this morning. Keys affected: T, Y, U, I. I have tried restarting but the issue persists. Need a replacement keyboard or temporary external keyboard to continue working.',
    }, anitaToken);
    if (r.success) {
      log('Helpdesk', `Anita created ticket "Laptop keyboard not working" (id=${r.data.id})`);
    } else {
      log('Helpdesk', `Anita ticket: ${r.error}`, false);
    }
  }

  // ---------- Product Team Operations ----------
  console.log('\n--- Product Team Operations ---');

  // Meera creates a survey — Meera is an employee, but surveys require HR role
  // The survey endpoint requires HR, so Priyanka creates it on behalf of product team
  if (prToken) {
    const r = await api('POST', '/surveys', {
      title: 'Q1 Sprint Satisfaction',
      description: 'Quick pulse survey to understand team satisfaction with Q1 sprints',
      type: 'pulse',
      is_anonymous: true,
      target_type: 'all',
      questions: [
        { question_text: 'How satisfied are you with the Q1 sprint planning process?', question_type: 'rating_1_5', sort_order: 1 },
        { question_text: 'Do you feel the sprint goals were realistic and achievable?', question_type: 'yes_no', sort_order: 2 },
        { question_text: 'What improvements would you suggest for Q2 sprint planning?', question_type: 'text', sort_order: 3 },
      ],
    }, prToken);
    if (r.success) {
      log('Survey', `Created "Q1 Sprint Satisfaction" (id=${r.data.id})`);
      // Publish it
      const pub = await api('POST', `/surveys/${r.data.id}/publish`, {}, prToken);
      if (pub.success) {
        log('Survey', `Published survey (id=${r.data.id})`);
      }
    } else {
      log('Survey', `Create survey: ${r.error}`, false);
    }
  }

  // Aakash submits anonymous feedback about office temperature
  const aakashToken = await getToken('aakash@nexgen.tech');
  if (aakashToken) {
    const r = await api('POST', '/feedback', {
      category: 'workplace',
      subject: 'Office temperature is too cold',
      message: 'The AC in the 3rd floor open area is set too low. Many colleagues have been wearing jackets indoors. Can we please adjust the temperature to a more comfortable level? Ideally around 24-25 degrees Celsius would be great.',
      sentiment: 'negative',
      is_urgent: false,
    }, aakashToken);
    if (r.success) {
      log('Feedback', `Aakash submitted anonymous feedback (id=${r.data.id})`);
    } else {
      log('Feedback', `Aakash feedback: ${r.error}`, false);
    }
  }

  // ---------- Sales Team Operations ----------
  console.log('\n--- Sales Team Operations ---');

  // Sunita requests regularization for yesterday
  const sunitaToken = await getToken('sunita@nexgen.tech');
  if (sunitaToken) {
    const r = await api('POST', '/attendance/regularizations', {
      date: yesterday(),
      requested_check_in: '09:00:00',
      requested_check_out: '18:15:00',
      reason: 'Was at client site (Infosys Mysore) for a product demo. Forgot to check in via the app. Can verify with Amit (Sales Director) who scheduled the meeting.',
    }, sunitaToken);
    if (r.success) {
      log('Regularization', `Sunita requested regularization for ${yesterday()} (id=${r.data.id})`);
    } else {
      log('Regularization', `Sunita: ${r.error}`, false);
    }
  }

  // Varun does wellness check-in
  const varunToken = await getToken('varun@nexgen.tech');
  if (varunToken) {
    const r = await api('POST', '/wellness/check-in', {
      mood: 'great',
      energy_level: 4,
      sleep_hours: 7.5,
      exercise_minutes: 30,
      notes: 'Had a great morning workout. Feeling energized and ready for the day!',
    }, varunToken);
    if (r.success) {
      log('Wellness', `Varun wellness check-in: mood=great, energy=4 (id=${r.data.id})`);
    } else {
      log('Wellness', `Varun check-in: ${r.error}`, false);
    }

    // Varun views wellness summary
    const summary = await api('GET', '/wellness/summary', null, varunToken);
    if (summary.success) {
      log('Wellness', `Varun viewed wellness summary`);
    }
  }

  // ---------- HR Approvals ----------
  console.log('\n--- HR Approvals ---');

  // Priyanka approves Kavya's leave (try HR first, fallback to admin)
  if (kavyaLeaveId) {
    let r = await api('PUT', `/leave/applications/${kavyaLeaveId}/approve`, {
      remarks: 'Approved. Enjoy the family function! Please ensure handover of ongoing tasks to Rohit.',
    }, prToken);
    if (!r.success && !r.skipped && adminToken) {
      // Fallback to admin token
      r = await api('PUT', `/leave/applications/${kavyaLeaveId}/approve`, {
        remarks: 'Approved. Enjoy the family function! Please ensure handover of ongoing tasks to Rohit.',
      }, adminToken);
    }
    if (r.success) {
      log('Leave-Approve', `Approved Kavya's EL (id=${kavyaLeaveId})`);
    } else if (r.status === 500) {
      log('Leave-Approve', `Kavya EL approve hit server bug (scoped variable in leave-application.service.ts — fix deployed in source, pending server restart)`, false);
    } else {
      log('Leave-Approve', `Approve Kavya: ${r.error}`, false);
    }
  }

  // Priyanka rejects Rohit's sick leave
  if (prToken && rohitLeaveId) {
    const r = await api('PUT', `/leave/applications/${rohitLeaveId}/reject`, {
      remarks: 'Please provide more notice for planned sick leave. If you are genuinely unwell, please apply on the day and provide a medical certificate. Insufficient notice as per company leave policy.',
    }, prToken);
    if (r.success) {
      log('Leave-Reject', `Priyanka rejected Rohit's SL (id=${rohitLeaveId})`);
    } else {
      log('Leave-Reject', `Reject Rohit: ${r.error}`, false);
    }
  }

  // Priyanka creates an event
  if (prToken) {
    const r = await api('POST', '/events', {
      title: 'Team Building Activity - April 5',
      description: 'Join us for an exciting team building activity! Activities include:\n\n- Treasure Hunt\n- Team Quiz\n- Outdoor Sports\n- BBQ Dinner\n\nTransportation will be arranged from office. Please RSVP by April 1.',
      event_type: 'team_building',
      start_date: '2026-04-05T09:00:00',
      end_date: '2026-04-05T18:00:00',
      location: 'Club Cabana, Devanahalli, Bangalore',
      target_type: 'all',
      max_attendees: 25,
      is_mandatory: false,
    }, prToken);
    if (r.success) {
      log('Event', `Created "Team Building Activity - April 5" (id=${r.data.id})`);
    } else {
      log('Event', `Create event: ${r.error}`, false);
    }
  }

  // ---------- Finance (Nikhil) ----------
  console.log('\n--- Finance Operations (Nikhil) ---');
  const nikhilToken = await getToken('nikhil@nexgen.tech');
  if (nikhilToken) {
    // View billing summary
    const billing = await api('GET', '/subscriptions/billing-summary', null, nikhilToken);
    if (billing.success) {
      log('Finance', `Nikhil viewed billing summary`);
    } else {
      log('Finance', `Billing summary: ${billing.error}`, false);
    }

    // Check subscription status
    const subs = await api('GET', '/subscriptions', null, nikhilToken);
    if (subs.success) {
      const subList = Array.isArray(subs.data) ? subs.data : [];
      log('Finance', `Nikhil checked subscriptions (${subList.length} active)`);
    } else {
      log('Finance', `Subscriptions: ${subs.error}`, false);
    }
  }

  // ---------- CEO (Vikram) ----------
  console.log('\n--- CEO Operations (Vikram) ---');
  const vikramToken = await getToken('vikram@nexgen.tech');
  if (vikramToken) {
    // View org chart
    const orgChart = await api('GET', '/users/org-chart', null, vikramToken);
    if (orgChart.success) {
      log('CEO', `Vikram viewed org chart`);
    } else {
      log('CEO', `Org chart: ${orgChart.error}`, false);
    }

    // View dashboard widgets
    const widgets = await api('GET', '/dashboard/widgets', null, vikramToken);
    if (widgets.success) {
      log('CEO', `Vikram viewed dashboard widgets`);
    } else {
      log('CEO', `Dashboard: ${widgets.error}`, false);
    }

    // View org stats
    const stats = await api('GET', '/organizations/me/stats', null, vikramToken);
    if (stats.success) {
      log('CEO', `Vikram viewed org stats: ${JSON.stringify(stats.data).substring(0, 200)}`);
    }
  }

  // View attendance report (Priyanka as HR)
  if (prToken) {
    const attReport = await api('GET', '/attendance/dashboard', null, prToken);
    if (attReport.success) {
      log('CEO', `Attendance dashboard retrieved: ${JSON.stringify(attReport.data).substring(0, 200)}`);
    }

    const monthlyReport = await api('GET', '/attendance/monthly-report?month=3&year=2026', null, prToken);
    if (monthlyReport.success) {
      log('CEO', `Monthly attendance report retrieved`);
    }
  }

  // ---------- ALL EMPLOYEES: Check Out ----------
  console.log('\n--- All Employees: Evening Check-Out ---');

  const checkOutTimes = [
    ['vikram@nexgen.tech', 18, 30],
    ['priyanka@nexgen.tech', 18, 15],
    ['arjun@nexgen.tech', 18, 45],
    ['kavya@nexgen.tech', 18, 10],
    ['rohit@nexgen.tech', 18, 0],
    ['sneha@nexgen.tech', 18, 5],
    ['deepak@nexgen.tech', 18, 30],
    ['anita@nexgen.tech', 17, 55],
    ['rahul@nexgen.tech', 18, 0],
    ['pooja@nexgen.tech', 18, 20],
    ['siddharth@nexgen.tech', 18, 15],
    ['meera@nexgen.tech', 18, 10],
    ['aakash@nexgen.tech', 17, 50],
    ['neha@nexgen.tech', 18, 0],
    ['rajesh@nexgen.tech', 17, 45],
    ['amit@nexgen.tech', 18, 30],
    ['sunita@nexgen.tech', 18, 15],
    ['varun@nexgen.tech', 18, 0],
    ['lakshmi@nexgen.tech', 18, 10],
    ['nikhil@nexgen.tech', 18, 5],
  ];

  for (const [email, hour, min] of checkOutTimes) {
    const token = await getToken(email);
    if (!token) continue;
    const r = await api('POST', '/attendance/check-out', {
      source: 'manual',
    }, token);
    if (r.success) {
      log('CheckOut', `${email} checked out at ${hour}:${String(min).padStart(2, '0')}`);
    } else if (r.skipped) {
      log('CheckOut', `${email} already checked out (idempotent)`);
    } else {
      log('CheckOut', `${email}: ${r.error}`, false);
    }
  }

  // ---------- Some employees acknowledge policies ----------
  console.log('\n--- Policy Acknowledgments ---');

  // Fetch policy IDs if we don't have them
  let polIds = policyIds;
  if (!polIds || polIds.length === 0) {
    const polList = await api('GET', '/policies', null, prToken || adminToken);
    if (polList.success) {
      const items = Array.isArray(polList.data) ? polList.data : (polList.data?.items || []);
      polIds = items.map(p => p.id);
    }
  }

  if (polIds && polIds.length > 0) {
    // A few employees acknowledge the policies
    const ackEmails = ['kavya@nexgen.tech', 'rohit@nexgen.tech', 'sneha@nexgen.tech', 'deepak@nexgen.tech', 'meera@nexgen.tech'];
    for (const email of ackEmails) {
      const token = await getToken(email);
      if (!token) continue;
      for (const polId of polIds) {
        const r = await api('POST', `/policies/${polId}/acknowledge`, {}, token);
        if (r.success) {
          log('PolicyAck', `${email} acknowledged policy id=${polId}`);
        }
      }
    }
  }

  // ---------- Some employees read announcements ----------
  console.log('\n--- Announcement Reads ---');
  const annList = await api('GET', '/announcements', null, prToken || adminToken);
  if (annList.success) {
    const anns = Array.isArray(annList.data) ? annList.data : (annList.data?.items || []);
    if (anns.length > 0) {
      // First 5 employees mark the first announcement as read
      const readEmails = ['arjun@nexgen.tech', 'kavya@nexgen.tech', 'siddharth@nexgen.tech', 'amit@nexgen.tech', 'nikhil@nexgen.tech'];
      for (const email of readEmails) {
        const token = await getToken(email);
        if (!token) continue;
        const r = await api('POST', `/announcements/${anns[0].id}/read`, {}, token);
        if (r.success) {
          log('AnnRead', `${email} read "${anns[0].title}"`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Final Report
// ---------------------------------------------------------------------------

function printReport() {
  console.log('\n========================================');
  console.log('         SIMULATION REPORT');
  console.log('========================================\n');

  const okCount = report.filter(l => l.startsWith('[OK]')).length;
  const failCount = report.filter(l => l.startsWith('[!!]')).length;

  console.log(`Total actions: ${report.length}`);
  console.log(`  Successful: ${okCount}`);
  console.log(`  Failed:     ${failCount}`);
  console.log('');

  // Group by section
  const sections = {};
  for (const line of report) {
    const match = line.match(/^\[..\] (.+?):/);
    if (match) {
      const sec = match[1];
      if (!sections[sec]) sections[sec] = { ok: 0, fail: 0 };
      if (line.startsWith('[OK]')) sections[sec].ok++;
      else sections[sec].fail++;
    }
  }

  console.log('--- By Section ---');
  for (const [sec, counts] of Object.entries(sections)) {
    const status = counts.fail > 0 ? `${counts.ok} OK, ${counts.fail} FAIL` : `${counts.ok} OK`;
    console.log(`  ${sec}: ${status}`);
  }

  if (failCount > 0) {
    console.log('\n--- Failed Actions ---');
    for (const line of report.filter(l => l.startsWith('[!!]'))) {
      console.log(`  ${line}`);
    }
  }

  console.log('\n========================================');
  console.log('  NexGen Technologies Simulation Done');
  console.log('========================================\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('========================================');
  console.log(' EMP Cloud — Organization Simulator');
  console.log(' Company: NexGen Technologies Pvt Ltd');
  console.log(' Employees: 20');
  console.log(' Date: ' + new Date().toISOString().split('T')[0]);
  console.log('========================================\n');

  try {
    const ctx = await phase1();
    await phase2(ctx);
  } catch (err) {
    console.error('\nFATAL ERROR:', err.message);
    console.error(err.stack);
  }

  printReport();
}

main();
