---
name: Issue intelligence report (2026-03-29)
description: 121 open issues analyzed. Top problems: RBAC broken in 3 modules, LMS/Recruit/Payroll down, 58 duplicates from automated tester
type: project
---

## Key Findings (121 open issues, 63 unique, 58 duplicates)

### Top Systemic Problems
1. **RBAC not enforced** — 12 unique issues, 27 filings. Employee can access admin pages in Performance (6 pages), Recruit (3), LMS (3). Security vulnerability.
2. **Modules unreachable** — Recruit API dead (no response), Payroll all endpoints broken, Projects SSO broken
3. **Pages render blank** — 8 Performance employee pages (My Performance, Reviews, Skills, Letters) show nothing
4. **58 of 121 issues are duplicates** — Automated tester files new issues each run without dedup

### Module Health
- GREEN: Rewards, Exit, Biometrics (zero open issues)
- YELLOW: Monitor (1 issue), EmpCloud Core (11 issues)
- RED: Performance (14 unique), LMS (12), Recruit (6), Billing (4), Payroll (3), Projects (2)

### Fix Priority
1. IMMEDIATE: LMS auth, Recruit API restart, Payroll API
2. HIGH: RBAC middleware across Performance/Recruit/LMS
3. MEDIUM: Performance employee pages, Billing seat counting
4. LOW: Security headers, feature gaps (password reset, whistleblowing)

### Recurring Patterns
- RBAC gaps: No role checks on frontend routes or server middleware
- Blank pages: API calls fail silently, no error boundaries
- 404s: Routes registered but not mounted, or nginx not configured
- Permission errors: HR-only middleware on employee-accessible endpoints
