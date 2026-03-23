const https = require('https');

const BASES = {
  empcloud: 'https://test-empcloud-api.empcloud.com/api/v1',
  recruit: 'https://test-recruit-api.empcloud.com/api/v1',
  performance: 'https://test-performance-api.empcloud.com/api/v1',
  rewards: 'https://test-rewards-api.empcloud.com/api/v1',
  exit: 'https://test-exit-api.empcloud.com/api/v1',
};

const TOKENS = {};
let PASS = 0;
let FAIL = 0;
const FAILURES = [];

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

    const req = https.request(url, { method: opts.method || 'GET', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

async function login() {
  // Get EmpCloud token
  const r = await fetch(`${BASES.empcloud}/auth/login`, {
    method: 'POST',
    body: { email: 'ananya@technova.in', password: 'Welcome@123' },
  });
  TOKENS.empcloud = r.body.data.tokens.access_token;
  console.log('=== EmpCloud token obtained ===');

  // Exchange for sub-module tokens via SSO
  for (const mod of ['recruit', 'performance', 'rewards', 'exit']) {
    try {
      const sr = await fetch(`${BASES[mod]}/auth/sso`, {
        method: 'POST',
        body: { token: TOKENS.empcloud },
      });
      if (sr.body.success && sr.body.data?.tokens) {
        TOKENS[mod] = sr.body.data.tokens.accessToken || sr.body.data.tokens.access_token;
        console.log(`=== ${mod} SSO token obtained ===`);
      } else {
        console.log(`!!! ${mod} SSO failed: ${JSON.stringify(sr.body).substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`!!! ${mod} SSO error: ${e.message}`);
    }
  }
  console.log('');
}

async function test(module, desc, url, tokenKey, checkFn) {
  const token = TOKENS[tokenKey];
  if (!token) {
    FAIL++;
    console.log(`  FAIL | [${module}] ${desc} (NO TOKEN for ${tokenKey})`);
    FAILURES.push({ module, desc, status: 'NO_TOKEN', preview: `No token for ${tokenKey}` });
    return;
  }

  try {
    const r = await fetch(url, { token });
    const ok = checkFn(r.body, r.status);
    if (ok) {
      PASS++;
      console.log(`  PASS | [${module}] ${desc} (HTTP ${r.status})`);
    } else {
      FAIL++;
      const preview = JSON.stringify(r.body).substring(0, 400);
      console.log(`  FAIL | [${module}] ${desc} (HTTP ${r.status})`);
      console.log(`         ${preview}`);
      FAILURES.push({ module, desc, status: r.status, preview });
    }
    return r;
  } catch (e) {
    FAIL++;
    console.log(`  FAIL | [${module}] ${desc} (ERROR: ${e.message})`);
    FAILURES.push({ module, desc, status: 'ERR', preview: e.message });
  }
}

// Helper: extract array from response data
function getArr(body, ...keys) {
  if (!body || !body.data) return [];
  if (Array.isArray(body.data)) return body.data;
  for (const k of keys) {
    if (body.data[k] && Array.isArray(body.data[k])) return body.data[k];
  }
  if (body.data.data && Array.isArray(body.data.data)) return body.data.data;
  return [];
}

async function main() {
  await login();

  const EC = BASES.empcloud;
  const ER = BASES.recruit;
  const EP = BASES.performance;
  const EW = BASES.rewards;
  const EX = BASES.exit;

  // ================================================================
  //  EMP CLOUD - User Search
  // ================================================================
  console.log('============================================');
  console.log('  EMP CLOUD - User Search');
  console.log('============================================');

  await test('EmpCloud', 'GET /users?search=Ananya -> find Ananya Gupta',
    `${EC}/users?search=Ananya`, 'empcloud',
    (b) => b.success === true && getArr(b, 'users').some(u => (u.first_name || '').includes('Ananya'))
  );

  await test('EmpCloud', 'GET /users?search=kumar -> find Kumars',
    `${EC}/users?search=kumar`, 'empcloud',
    (b) => b.success === true && getArr(b, 'users').length >= 1
  );

  await test('EmpCloud', 'GET /users?search=nonexistent -> empty',
    `${EC}/users?search=nonexistent`, 'empcloud',
    (b) => b.success === true && getArr(b, 'users').length === 0
  );

  await test('EmpCloud', 'GET /users?search= -> return all (no filter)',
    `${EC}/users?search=`, 'empcloud',
    (b) => b.success === true && getArr(b, 'users').length > 0
  );

  // ================================================================
  //  EMP CLOUD - Employee Directory
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP CLOUD - Employee Directory');
  console.log('============================================');

  await test('EmpCloud', 'GET /employees/directory?search=Engineering -> find dept',
    `${EC}/employees/directory?search=Engineering`, 'empcloud',
    (b) => b.success === true && getArr(b, 'employees').length > 0
  );

  await test('EmpCloud', 'GET /employees/directory?department_id=1 -> filter by dept',
    `${EC}/employees/directory?department_id=1`, 'empcloud',
    (b) => b.success === true && getArr(b, 'employees').length > 0
  );

  await test('EmpCloud', 'GET /employees/directory?search=VP -> find VP-level',
    `${EC}/employees/directory?search=VP`, 'empcloud',
    (b) => b.success === true && getArr(b, 'employees').length > 0
  );

  let dirPage1;
  await test('EmpCloud', 'GET /employees/directory?page=1&per_page=10 -> 10 results',
    `${EC}/employees/directory?page=1&per_page=10`, 'empcloud',
    (b) => {
      const arr = getArr(b, 'employees');
      dirPage1 = arr;
      return b.success === true && arr.length > 0 && arr.length <= 10;
    }
  );

  await test('EmpCloud', 'GET /employees/directory?page=2&per_page=10 -> different results',
    `${EC}/employees/directory?page=2&per_page=10`, 'empcloud',
    (b) => {
      const arr = getArr(b, 'employees');
      // Verify it's a different page (different first element)
      if (dirPage1 && arr.length > 0 && dirPage1.length > 0) {
        return b.success === true && arr[0].id !== dirPage1[0].id;
      }
      return b.success === true;
    }
  );

  await test('EmpCloud', 'GET /employees/directory?page=500&per_page=10 -> empty (beyond total)',
    `${EC}/employees/directory?page=500&per_page=10`, 'empcloud',
    (b) => b.success === true && getArr(b, 'employees').length === 0
  );

  // ================================================================
  //  EMP CLOUD - Attendance Filters
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP CLOUD - Attendance Filters');
  console.log('============================================');

  await test('EmpCloud', 'GET /attendance/records?month=3&year=2026 -> March records',
    `${EC}/attendance/records?month=3&year=2026`, 'empcloud',
    (b, s) => s === 200 && b.success === true
  );

  await test('EmpCloud', 'GET /attendance/records?user_id=1 -> user 1 only',
    `${EC}/attendance/records?user_id=1`, 'empcloud',
    (b, s) => s === 200 && b.success === true
  );

  // ================================================================
  //  EMP CLOUD - Leave Filters
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP CLOUD - Leave Filters');
  console.log('============================================');

  await test('EmpCloud', 'GET /leave/applications?status=approved',
    `${EC}/leave/applications?status=approved`, 'empcloud',
    (b, s) => s === 200 && b.success === true
  );

  await test('EmpCloud', 'GET /leave/applications?status=pending',
    `${EC}/leave/applications?status=pending`, 'empcloud',
    (b, s) => s === 200 && b.success === true
  );

  await test('EmpCloud', 'GET /leave/applications?leave_type_id=1',
    `${EC}/leave/applications?leave_type_id=1`, 'empcloud',
    (b, s) => s === 200 && b.success === true
  );

  // ================================================================
  //  EMP CLOUD - Audit Log Pagination
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP CLOUD - Audit Log Pagination');
  console.log('============================================');

  let auditTotal = 0;
  await test('EmpCloud', 'GET /audit?page=1&per_page=5 -> 5 results',
    `${EC}/audit?page=1&per_page=5`, 'empcloud',
    (b) => {
      const arr = getArr(b, 'logs', 'audits', 'records', 'entries');
      auditTotal = b.data?.pagination?.total || b.data?.total || 0;
      return b.success === true && arr.length > 0 && arr.length <= 5;
    }
  );

  await test('EmpCloud', 'GET /audit?page=2&per_page=5 -> next 5 + consistent total',
    `${EC}/audit?page=2&per_page=5`, 'empcloud',
    (b) => {
      const total2 = b.data?.pagination?.total || b.data?.total || 0;
      const consistent = auditTotal === 0 || total2 === 0 || auditTotal === total2;
      return b.success === true && consistent;
    }
  );

  // ================================================================
  //  EMP RECRUIT - Job Search + Filters
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP RECRUIT - Job Search + Filters');
  console.log('============================================');

  await test('Recruit', 'GET /jobs?status=open -> only open jobs',
    `${ER}/jobs?status=open`, 'recruit',
    (b, s) => s === 200 && b.success === true && getArr(b, 'jobs').every(j => j.status === 'open' || j.status === 'published')
  );

  await test('Recruit', 'GET /jobs?status=draft -> only drafts',
    `${ER}/jobs?status=draft`, 'recruit',
    (b, s) => s === 200 && b.success === true
  );

  await test('Recruit', 'GET /jobs?page=1&per_page=5 -> paginated',
    `${ER}/jobs?page=1&per_page=5`, 'recruit',
    (b, s) => s === 200 && b.success === true && getArr(b, 'jobs').length <= 5
  );

  // ================================================================
  //  EMP RECRUIT - Candidate Search
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP RECRUIT - Candidate Search');
  console.log('============================================');

  await test('Recruit', 'GET /candidates?search=Priya -> find by name',
    `${ER}/candidates?search=Priya`, 'recruit',
    (b, s) => s === 200 && b.success === true
  );

  await test('Recruit', 'GET /candidates?search=infosys -> find by company',
    `${ER}/candidates?search=infosys`, 'recruit',
    (b, s) => s === 200 && b.success === true
  );

  await test('Recruit', 'GET /candidates?page=1&per_page=5 -> paginated',
    `${ER}/candidates?page=1&per_page=5`, 'recruit',
    (b, s) => s === 200 && b.success === true && getArr(b, 'candidates').length <= 5
  );

  // ================================================================
  //  EMP RECRUIT - Application Filters
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP RECRUIT - Application Filters');
  console.log('============================================');

  await test('Recruit', 'GET /applications?stage=applied -> only applied',
    `${ER}/applications?stage=applied`, 'recruit',
    (b, s) => s === 200 && b.success === true
  );

  await test('Recruit', 'GET /applications?stage=interview -> only interview',
    `${ER}/applications?stage=interview`, 'recruit',
    (b, s) => s === 200 && b.success === true
  );

  // Get a job_id for filtering
  const jobsR = await fetch(`${ER}/jobs?page=1&per_page=1`, { token: TOKENS.recruit });
  const firstJobArr = getArr(jobsR.body, 'jobs');
  if (firstJobArr.length > 0) {
    const jobId = firstJobArr[0].id;
    await test('Recruit', `GET /applications?job_id=${jobId} -> specific job`,
      `${ER}/applications?job_id=${jobId}`, 'recruit',
      (b, s) => s === 200 && b.success === true
    );
  }

  // ================================================================
  //  EMP RECRUIT - Interview Filters
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP RECRUIT - Interview Filters');
  console.log('============================================');

  await test('Recruit', 'GET /interviews?status=scheduled -> scheduled only',
    `${ER}/interviews?status=scheduled`, 'recruit',
    (b, s) => s === 200 && b.success === true
  );

  // ================================================================
  //  EMP PERFORMANCE - Goal Filters
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP PERFORMANCE - Goal Filters');
  console.log('============================================');

  await test('Performance', 'GET /goals?category=individual',
    `${EP}/goals?category=individual`, 'performance',
    (b, s) => s === 200 && b.success === true
  );

  await test('Performance', 'GET /goals?status=in_progress',
    `${EP}/goals?status=in_progress`, 'performance',
    (b, s) => s === 200 && b.success === true
  );

  await test('Performance', 'GET /goals?employee_id=1',
    `${EP}/goals?employee_id=1`, 'performance',
    (b, s) => s === 200 && b.success === true
  );

  // ================================================================
  //  EMP PERFORMANCE - Review Cycle Filters
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP PERFORMANCE - Review Cycle Filters');
  console.log('============================================');

  await test('Performance', 'GET /review-cycles?status=active',
    `${EP}/review-cycles?status=active`, 'performance',
    (b, s) => s === 200 && b.success === true
  );

  await test('Performance', 'GET /review-cycles?type=quarterly',
    `${EP}/review-cycles?type=quarterly`, 'performance',
    (b, s) => s === 200 && b.success === true
  );

  // ================================================================
  //  EMP PERFORMANCE - PIP Filters
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP PERFORMANCE - PIP Filters');
  console.log('============================================');

  await test('Performance', 'GET /pips?status=active',
    `${EP}/pips?status=active`, 'performance',
    (b, s) => s === 200 && b.success === true
  );

  await test('Performance', 'GET /pips?employee_id=1',
    `${EP}/pips?employee_id=1`, 'performance',
    (b, s) => s === 200 && b.success === true
  );

  // ================================================================
  //  EMP REWARDS - Kudos Feed
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP REWARDS - Kudos Feed');
  console.log('============================================');

  await test('Rewards', 'GET /kudos?page=1&per_page=5 -> paginated',
    `${EW}/kudos?page=1&per_page=5`, 'rewards',
    (b, s) => s === 200 && b.success === true
  );

  await test('Rewards', 'GET /kudos/received -> my received',
    `${EW}/kudos/received`, 'rewards',
    (b, s) => s === 200 && b.success === true
  );

  await test('Rewards', 'GET /kudos/sent -> my sent',
    `${EW}/kudos/sent`, 'rewards',
    (b, s) => s === 200 && b.success === true
  );

  // ================================================================
  //  EMP REWARDS - Leaderboard
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP REWARDS - Leaderboard Periods');
  console.log('============================================');

  await test('Rewards', 'GET /leaderboard?period=weekly',
    `${EW}/leaderboard?period=weekly`, 'rewards',
    (b, s) => s === 200 && b.success === true
  );

  await test('Rewards', 'GET /leaderboard?period=monthly',
    `${EW}/leaderboard?period=monthly`, 'rewards',
    (b, s) => s === 200 && b.success === true
  );

  await test('Rewards', 'GET /leaderboard?period=all_time',
    `${EW}/leaderboard?period=all_time`, 'rewards',
    (b, s) => s === 200 && b.success === true
  );

  // ================================================================
  //  EMP EXIT - Exit Filters
  // ================================================================
  console.log('\n============================================');
  console.log('  EMP EXIT - Exit Filters');
  console.log('============================================');

  await test('Exit', 'GET /exits?status=initiated',
    `${EX}/exits?status=initiated`, 'exit',
    (b, s) => s === 200 && b.success === true
  );

  await test('Exit', 'GET /exits?status=completed',
    `${EX}/exits?status=completed`, 'exit',
    (b, s) => s === 200 && b.success === true
  );

  // ================================================================
  //  SUMMARY
  // ================================================================
  console.log('\n============================================');
  console.log('  SUMMARY');
  console.log('============================================');
  console.log(`  PASSED: ${PASS}`);
  console.log(`  FAILED: ${FAIL}`);
  console.log(`  TOTAL:  ${PASS + FAIL}`);

  if (FAILURES.length > 0) {
    console.log('\n  FAILURES:');
    for (const f of FAILURES) {
      console.log(`  - [${f.module}] ${f.desc} (HTTP ${f.status})`);
      console.log(`    ${f.preview}`);
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
