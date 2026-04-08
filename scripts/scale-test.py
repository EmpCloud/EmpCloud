#!/usr/bin/env python3
"""Scale test: Seed 500 employees, benchmark APIs, seed to 5000, re-benchmark, stress test, cleanup."""

import paramiko
import json
import time
import sys
import os

HOST = "163.227.174.141"
USER = "empcloud-development"
PASS = os.environ.get("SSH_PASSWORD", "")
DB_USER = "empcloud"
DB_PASS = os.environ.get("DB_PASSWORD", "")
DB_NAME = "empcloud"
ORG_ID = 5  # TechNova

# bcrypt hash of "Test@12345" (pre-computed)
BCRYPT_HASH = "$2a$04$LK3H7zVwEPuRS2t/0sG1CuYvRGpqNj9G1xvXnZwMG/lEhF6Ks5J2S"

def ssh_cmd(client, cmd, timeout=120):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return out, err

def connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASS, timeout=15)
    return client

def mysql_cmd(client, sql):
    cmd = f'mysql -u {DB_USER} -p{DB_PASS} {DB_NAME} -e "{sql}" 2>/dev/null'
    return ssh_cmd(client, cmd)

def get_token(client):
    cmd = '''curl -s -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"ananya@technova.in","password":"Welcome@123"}' '''
    out, _ = ssh_cmd(client, cmd)
    data = json.loads(out)
    tokens = data.get("data", {}).get("tokens", {})
    token = tokens.get("access_token") or tokens.get("accessToken")
    if not token:
        token = data.get("data", {}).get("accessToken") or data.get("data", {}).get("access_token")
    if not token:
        print(f"Could not extract token from: {json.dumps(data)[:500]}")
        sys.exit(1)
    print(f"Got admin token: {token[:30]}...")
    return token

def get_bcrypt_hash(client):
    """Generate a bcrypt hash on the server for Test@12345."""
    cmd = '''node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('Test@12345', 4).then(h => console.log(h));" 2>/dev/null || python3 -c "import bcrypt; print(bcrypt.hashpw(b'Test@12345', bcrypt.gensalt(4)).decode())" 2>/dev/null'''
    out, _ = ssh_cmd(client, cmd)
    h = out.strip()
    if h and h.startswith("$2"):
        return h
    return None

def seed_via_mysql(client, start, end, label):
    """Seed employees via MySQL batch INSERT for speed."""
    t0 = time.time()
    batch_size = 500
    total = 0
    depts = [20, 21, 22, 23, 24]  # Will use modulo

    # First get a valid bcrypt hash from the server
    print(f"  Generating password hash on server...")
    pw_hash = get_bcrypt_hash(client)
    if not pw_hash:
        print("  WARN: Could not generate bcrypt hash, using pre-computed one")
        pw_hash = BCRYPT_HASH

    for batch_start in range(start, end + 1, batch_size):
        batch_end = min(batch_start + batch_size - 1, end)
        count = batch_end - batch_start + 1
        print(f"  Inserting {batch_start}-{batch_end} ({count} rows)...", end=" ", flush=True)

        # Build VALUES clause
        values = []
        for i in range(batch_start, batch_end + 1):
            dept_id = depts[i % len(depts)]
            values.append(
                f"({ORG_ID},'Scale{i}','Test','scale{i}@test.empcloud.com',"
                f"'{pw_hash}','ST-{i:05d}','employee','full_time',{dept_id},"
                f"'Software Engineer',1,'en','on_probation',NOW(),NOW())"
            )

        sql = (
            "INSERT IGNORE INTO users "
            "(organization_id,first_name,last_name,email,password,emp_code,role,employment_type,department_id,"
            "designation,status,language,probation_status,created_at,updated_at) VALUES "
            + ",".join(values) + ";"
        )

        # Write SQL to a temp file and execute it (avoids shell escaping issues)
        write_cmd = f"cat > /tmp/scale_insert.sql << 'SQLEOF'\n{sql}\nSQLEOF"
        ssh_cmd(client, write_cmd)
        out, err = ssh_cmd(client, f'mysql -u {DB_USER} -p{DB_PASS} {DB_NAME} < /tmp/scale_insert.sql 2>&1')
        if "ERROR" in out or "ERROR" in err:
            print(f"ERROR: {(out + err).strip()[:200]}")
        else:
            total += count
            print(f"ok")

    elapsed = time.time() - t0
    # Verify count
    out, _ = mysql_cmd(client, "SELECT COUNT(*) as cnt FROM users WHERE email LIKE 'scale%@test.empcloud.com';")
    actual = out.strip().split("\n")[-1].strip() if out.strip() else "?"
    print(f"  {label}: inserted {total} rows in {elapsed:.1f}s (verified: {actual} in DB)")
    return total, elapsed

def seed_via_api(client, token, start, end, concurrency=10):
    """Seed employees via API with parallel curl."""
    t0 = time.time()
    batch_size = concurrency
    total_ok = 0
    total_fail = 0

    for batch_start in range(start, end + 1, batch_size):
        batch_end = min(batch_start + batch_size - 1, end)
        print(f"  API seeding {batch_start}-{batch_end}...", end=" ", flush=True)

        cmds = []
        for i in range(batch_start, batch_end + 1):
            dept_id = (i % 5) + 1
            cmds.append(
                f'curl -s -o /dev/null -w "%{{http_code}}\\n" -X POST http://localhost:3000/api/v1/users '
                f'-H "Authorization: Bearer {token}" '
                f'-H "Content-Type: application/json" '
                f"""-d '{{"first_name":"Scale{i}","last_name":"Test","email":"scale{i}@test.empcloud.com","password":"Test@12345","role":"employee"}}' &"""
            )

        script = "\n".join(cmds) + "\nwait"
        out, _ = ssh_cmd(client, script, timeout=120)
        codes = [c.strip() for c in out.strip().split("\n") if c.strip()]
        ok = sum(1 for c in codes if c in ("200", "201"))
        fail = len(codes) - ok
        total_ok += ok
        total_fail += fail
        print(f"ok={ok} fail={fail}")

    elapsed = time.time() - t0
    print(f"  Total: created={total_ok}, failed={total_fail}, time={elapsed:.1f}s")
    return total_ok, total_fail, elapsed

def benchmark_api(client, token, label, path):
    """Time a single API call."""
    cmd = f'''curl -s -o /dev/null -w "%{{http_code}} %{{time_total}}" "http://localhost:3000/api/v1{path}" -H "Authorization: Bearer {token}"'''
    out, _ = ssh_cmd(client, cmd, timeout=30)
    parts = out.strip().split()
    status = int(parts[0]) if len(parts) >= 1 else 0
    time_s = float(parts[1]) if len(parts) >= 2 else 0
    ms = int(time_s * 1000)
    flag = "OK" if ms < 2000 else "SLOW"
    print(f"  {label:45s} {status:3d}  {ms:6d}ms  {flag}")
    return status, ms

def run_benchmarks(client, token, label):
    print(f"\n{'='*60}")
    print(f"API Benchmarks — {label}")
    print(f"{'='*60}")
    endpoints = [
        ("GET /employees?page=1&per_page=50",         "/employees?page=1&per_page=50"),
        ("GET /employees?page=10&per_page=50",         "/employees?page=10&per_page=50"),
        ("GET /employees?search=Scale100",             "/employees?search=Scale100"),
        ("GET /employees/directory",                   "/employees/directory"),
        ("GET /attendance/records",                    "/attendance/records"),
        ("GET /leave/balances",                        "/leave/balances"),
        ("GET /admin/overview",                        "/admin/overview"),
    ]
    results = {}
    for name, path in endpoints:
        status, ms = benchmark_api(client, token, name, path)
        results[name] = (status, ms)
    return results

def stress_test(client, token):
    print(f"\n{'='*60}")
    print("Phase 4: Stress Test")
    print(f"{'='*60}")

    # 50 concurrent GET /employees
    print("\n  [1] 50 concurrent GET /employees?page=1&per_page=50")
    cmd = f'''
for i in $(seq 1 50); do
  curl -s -o /dev/null -w "%{{http_code}} %{{time_total}}\\n" "http://localhost:3000/api/v1/employees?page=1&per_page=50" -H "Authorization: Bearer {token}" &
done
wait
'''
    out, _ = ssh_cmd(client, cmd, timeout=120)
    parse_stress_results(out, "200")

    # 20 concurrent logins
    print("\n  [2] 20 concurrent login attempts")
    cmd = '''
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code} %{time_total}\\n" -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"ananya@technova.in","password":"Welcome@123"}' &
done
wait
'''
    out, _ = ssh_cmd(client, cmd, timeout=120)
    parse_stress_results(out, "200")

    # 10 concurrent leave applications
    print("\n  [3] 10 concurrent leave applications")
    cmd = f'''
for i in $(seq 1 10); do
  DAY=$(printf "%02d" $((10 + $i)))
  curl -s -o /dev/null -w "%{{http_code}} %{{time_total}}\\n" -X POST "http://localhost:3000/api/v1/leave/applications" \
    -H "Authorization: Bearer {token}" \
    -H "Content-Type: application/json" \
    -d '{{"leave_type_id":1,"start_date":"2026-08-'$DAY'","end_date":"2026-08-'$DAY'","reason":"Scale test '$i'"}}' &
done
wait
'''
    out, _ = ssh_cmd(client, cmd, timeout=60)
    parse_stress_results(out, "201")

def parse_stress_results(out, expected_code):
    lines = [l.strip() for l in out.strip().split("\n") if l.strip()]
    statuses = []
    times = []
    for line in lines:
        parts = line.split()
        if len(parts) >= 2:
            statuses.append(parts[0])
            try:
                times.append(float(parts[1]))
            except:
                pass
    ok = sum(1 for s in statuses if s == expected_code)
    fail = len(statuses) - ok
    if times:
        avg_t = sum(times) / len(times)
        max_t = max(times)
        min_t = min(times)
        p95 = sorted(times)[int(len(times) * 0.95)] if len(times) >= 2 else max_t
        print(f"      Responses: {ok} ok, {fail} failed (of {len(statuses)} total)")
        print(f"      Latency:   min={min_t:.2f}s  avg={avg_t:.2f}s  p95={p95:.2f}s  max={max_t:.2f}s")
    else:
        print(f"      No valid responses parsed from output: {out[:200]}")

def cleanup(client):
    print(f"\n{'='*60}")
    print("Phase 6: Cleanup")
    print(f"{'='*60}")

    out, _ = mysql_cmd(client, "SELECT COUNT(*) as cnt FROM users WHERE email LIKE 'scale%@test.empcloud.com';")
    print(f"  Scale users before cleanup: {out.strip().split(chr(10))[-1].strip()}")

    # Delete related records first (foreign keys)
    for table in ["employee_profiles", "attendance_records", "leave_balances", "leave_applications"]:
        cmd = (
            f"DELETE t FROM {table} t INNER JOIN users u ON t.user_id = u.id "
            f"WHERE u.email LIKE 'scale%@test.empcloud.com';"
        )
        mysql_cmd(client, cmd)

    out, _ = mysql_cmd(client, "DELETE FROM users WHERE email LIKE 'scale%@test.empcloud.com';")
    print(f"  Deleted scale test users")

    out, _ = mysql_cmd(client, "SELECT COUNT(*) as cnt FROM users WHERE email LIKE 'scale%@test.empcloud.com';")
    print(f"  Scale users after cleanup: {out.strip().split(chr(10))[-1].strip()}")

    out, _ = mysql_cmd(client, "SELECT COUNT(*) as total FROM users;")
    print(f"  Total users remaining: {out.strip().split(chr(10))[-1].strip()}")

def main():
    print("=" * 60)
    print("EMP Cloud Scale Test")
    print("=" * 60)

    client = connect()
    print("Connected to server.\n")

    # Check current state
    out, _ = mysql_cmd(client, "SELECT COUNT(*) as total FROM users;")
    baseline = out.strip().split("\n")[-1].strip()
    print(f"Baseline user count: {baseline}")

    # Clean any leftover scale users
    mysql_cmd(client, "DELETE FROM users WHERE email LIKE 'scale%@test.empcloud.com';")

    token = get_token(client)

    # ---- Phase 1: Seed 500 via API (to test API under load) ----
    print(f"\n{'='*60}")
    print("Phase 1: Seed 500 Employees via API")
    print(f"{'='*60}")
    api_created, api_failed, api_time = seed_via_api(client, token, 1, 500, concurrency=20)

    out, _ = mysql_cmd(client, "SELECT COUNT(*) as total FROM users;")
    print(f"  User count now: {out.strip().split(chr(10))[-1].strip()}")

    # ---- Phase 2: Benchmark with ~500 employees ----
    results_500 = run_benchmarks(client, token, "~500 scale employees")

    # ---- Phase 3: Seed to 5000 via MySQL (fast bulk insert) ----
    print(f"\n{'='*60}")
    print("Phase 3: Seed to 5000 Employees via MySQL Bulk Insert")
    print(f"{'='*60}")
    mysql_created, mysql_time = seed_via_mysql(client, 501, 5000, "Phase 3")

    out, _ = mysql_cmd(client, "SELECT COUNT(*) as total FROM users;")
    print(f"  User count now: {out.strip().split(chr(10))[-1].strip()}")

    # ---- Re-benchmark with 5000 ----
    results_5000 = run_benchmarks(client, token, "~5000 scale employees")

    # ---- Phase 4: Stress test ----
    stress_test(client, token)

    # ---- Phase 6: Cleanup ----
    cleanup(client)

    # ---- Summary ----
    print(f"\n{'='*60}")
    print("FINAL SUMMARY")
    print(f"{'='*60}")
    print(f"Phase 1: API-seeded {api_created}/500 in {api_time:.1f}s ({api_failed} failed)")
    print(f"Phase 3: MySQL-seeded {mysql_created}/4500 in {mysql_time:.1f}s")
    print(f"\nResponse Time Comparison (ms):")
    print(f"  {'Endpoint':45s} {'500':>8s} {'5000':>8s} {'Change':>10s}")
    print(f"  {'-'*45} {'-'*8} {'-'*8} {'-'*10}")
    for name in results_500:
        ms500 = results_500[name][1]
        ms5000 = results_5000.get(name, (0, 0))[1]
        if ms500 > 0:
            change = f"{ms5000/ms500:.1f}x"
        else:
            change = "N/A"
        flag500 = "OK" if ms500 < 2000 else "SLOW"
        flag5000 = "OK" if ms5000 < 2000 else "SLOW"
        print(f"  {name:45s} {ms500:>7d} {ms5000:>7d}  {change:>8s}")

    # Check if any endpoint exceeded 2s
    slow = []
    for name in results_5000:
        if results_5000[name][1] > 2000:
            slow.append(f"  - {name}: {results_5000[name][1]}ms")
    if slow:
        print(f"\nEndpoints exceeding 2s threshold at 5000 scale:")
        print("\n".join(slow))
    else:
        print(f"\nAll endpoints under 2s threshold at 5000 scale.")

    client.close()
    print("\nDone.")

if __name__ == "__main__":
    main()
