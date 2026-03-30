---
name: Corrected module URLs (nginx server_names)
description: Exact frontend and API URLs verified against nginx configs — some have hyphens, some don't
type: reference
---

## Verified URLs (2026-03-29)

| Module | Frontend URL | API URL | Port |
|--------|-------------|---------|------|
| EMP Cloud | test-empcloud.empcloud.com | test-empcloud-api.empcloud.com | 3000 |
| EMP Recruit | test-recruit.empcloud.com | test-recruit-api.empcloud.com | 4500 |
| EMP Performance | test-performance.empcloud.com | test-performance-api.empcloud.com | 4300 |
| EMP Rewards | test-rewards.empcloud.com | test-rewards-api.empcloud.com | 4600 |
| EMP Exit | test-exit.empcloud.com | test-exit-api.empcloud.com | 4400 |
| EMP LMS | testlms.empcloud.com | testlms-api.empcloud.com | 4700 |
| EMP Payroll | testpayroll.empcloud.com | testpayroll-api.empcloud.com | 4000 |
| EMP Project | test-project.empcloud.com | test-project-api.empcloud.com | 9000 |
| EMP Monitor | test-empmonitor.empcloud.com | test-empmonitor-api.empcloud.com | 5000 |
| EMP Billing | (internal) | **test-billing-api.empcloud.com** | 4001 |

## URL Gotchas
- **Billing**: Correct URL is `test-billing-api` (with hyphen). NOT `testbilling-api`. Dashboard health check must use the hyphenated version.
- **LMS & Payroll**: These use `testlms` / `testpayroll` (NO hyphen after test). All others use `test-` prefix with hyphen.
- **Monitor**: nginx server_name is `test-empmonitor-api`, matching DNS. The old `testmonitor-api` does not exist.
- All URLs verified against nginx `/etc/nginx/sites-enabled/` configs on 163.227.174.141.
