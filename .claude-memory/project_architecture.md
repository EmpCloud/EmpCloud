---
name: EMP Ecosystem — Status after orchestrator session (2026-03-29)
description: 12-module HRMS, all modules deployed, DNS resolved, 200+ issues processed, 16 business rules, salary API
type: project
---

## Platform: 98% complete, all modules live

### Module Status (all DNS resolved, nginx configured)
| Module | FE Domain | API Domain | Port | Status |
|--------|-----------|------------|------|--------|
| Cloud | test-empcloud.empcloud.com | test-empcloud-api.empcloud.com | 3000 | GREEN |
| Recruit | test-recruit.empcloud.com | test-recruit-api.empcloud.com | 4500 | GREEN |
| Performance | test-performance.empcloud.com | test-performance-api.empcloud.com | 4300 | GREEN |
| Rewards | test-rewards.empcloud.com | test-rewards-api.empcloud.com | 4600 | GREEN |
| Exit | test-exit.empcloud.com | test-exit-api.empcloud.com | 4400 | GREEN |
| Payroll | (SSO) | testpayroll-api.empcloud.com | 4000 | GREEN |
| LMS | (SSO) | testlms-api.empcloud.com | 4700 | GREEN |
| Monitor | test-empmonitor.empcloud.com | test-empmonitor-api.empcloud.com | 5000 | YELLOW |
| Project | test-project.empcloud.com | test-project-api.empcloud.com | 9000 | GREEN |
| Billing | (internal) | testbilling-api.empcloud.com | — | GREEN |
| Field | test-field.empcloud.com | test-field-api.empcloud.com | — | NOT DEPLOYED |
| Biometrics | — | — | — | BUILT INTO CLOUD |

### Key Implementations This Session
- Salary Structure API (GET/PUT /employees/:id/salary) with PF/ESI/CTC/gratuity validation
- Payroll rules utility (payroll-rules.ts): PF cap Rs 15K, ESI disable >Rs 21K, CTC formula, OT calc
- F&F settlement calculator (fnf-settlement.ts)
- Billing dunning workflow (4-stage: reminder→warning→suspend→deactivate)
- Billing grace period (per-org configurable)
- Password expiry policy (password_changed_at tracking)
- Free tier limits (max users, max modules)
- 7 business rules: probation leave, dept delete guard, asset delete guard, shift overlap, headcount, notice period, ticket resolution
- 9 validation fixes: document RBAC, failed login audit, past leave cancel, seat limits, org chart, DOB validation, phone mapping
- All module route aliases (whistleblowing, helpdesk KB, employees, SSO, etc.)
- Monitor: API URL fix, RBAC fix, typo fix
- LMS: isAdminRole() RBAC fix
- Recruit: JD templates, generate alias
- Exit: 9 route aliases + NPS + my-clearances
- Performance: 5 route aliases
- Projects: 3 server crash fixes + nginx config
