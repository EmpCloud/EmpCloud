---
name: Test server domains and ports (DNS fixed 2026-03-29)
description: All module URLs, ports, PM2 processes on test server 163.227.174.141. DNS all resolved. No SSH key access from local machine.
type: reference
---

## Server: 163.227.174.141
- User: empcloud-development
- Password: <REDACTED - see .env>
- **SSH access: Use password auth via Python paramiko** (sshpass unavailable on Windows). Never use SSH keys — none exist for the server.

## Module Domains (ALL DNS resolved, nginx configured)

| Module | Frontend | API | Port |
|--------|----------|-----|------|
| EMP Cloud | test-empcloud.empcloud.com | test-empcloud-api.empcloud.com | 3000 |
| EMP Recruit | test-recruit.empcloud.com | test-recruit-api.empcloud.com | 4500 |
| EMP Rewards | test-rewards.empcloud.com | test-rewards-api.empcloud.com | 4600 |
| EMP Performance | test-performance.empcloud.com | test-performance-api.empcloud.com | 4300 |
| EMP Exit | test-exit.empcloud.com | test-exit-api.empcloud.com | 4400 |
| EMP Monitor | test-empmonitor.empcloud.com | test-empmonitor-api.empcloud.com | 5000 |
| EMP Payroll | (SSO from Cloud) | testpayroll-api.empcloud.com | 4000 |
| EMP LMS | (SSO from Cloud) | testlms-api.empcloud.com | 4700 |
| EMP Billing | (internal) | testbilling-api.empcloud.com | — |
| EMP Project | test-project.empcloud.com | test-project-api.empcloud.com | 9000 |
| EMP Field | test-field.empcloud.com | test-field-api.empcloud.com | (not deployed) |

## Login
- ananya@technova.in / <REDACTED> (org_admin)
- admin@empcloud.com / Admin@123 (super_admin)
- All modules support direct login + SSO from EmpCloud
