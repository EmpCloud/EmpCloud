# Feature Requests — Implementation TODOs

Collected from GitHub issues. To be planned and prioritized together.

## Completed

### #563 — Bulk Approval, Export, Probation Tracking -- DONE
- [x] Bulk approve/reject leave requests (select multiple -> approve all) -- `69b8991`
- [x] Export attendance to CSV -- `b01b6e7`
- [x] Probation period tracking with auto-alerts before confirmation date -- `b01b6e7`

### #556 — Employee Self-Service Profile Editing -- DONE
- [x] Employee can edit their own profile (name, phone, address, emergency contact) -- `a9340c9`
- [x] Changes submitted directly (self or HR can edit) -- `a9340c9`

### #564 — Mobile Responsive / Hamburger Menu -- DONE
- [x] Sidebar not accessible on mobile (375px viewport) -- fixed -- `e586afe`
- [x] Add hamburger menu toggle for mobile view -- `e586afe`
- [x] Make all pages responsive -- `e586afe`

### #499 — Audit Log Filter Controls -- DONE
- [x] Filter by: action type, date range -- `c8a88cd`
- [x] Dropdowns + date pickers on /audit page -- `c8a88cd`

### #519 — Create Organization from Super Admin -- DONE
- [x] Add "Create Organization" button on /admin/organizations -- `5b35407`
- [x] Form: org name, admin email, plan tier -- `5b35407`

### #520 — Platform Settings UI -- DONE
- [x] SMTP configuration (host, port, user, password) -- `8bcc8b2`
- [x] Security policies (password rules, session timeout) -- `8bcc8b2`
- [x] Platform info and settings page -- `b01b6e7`

### #545 — Team Attendance Date Range Filter -- DONE
- [x] Add date range picker to view historical attendance -- `788c0f0`
- [x] Filter by department, date range -- `788c0f0`

### Additional completed features (not from original requests)
- [x] Profile photo upload -- `b01b6e7`
- [x] Attendance regularization requests -- `b01b6e7`
- [x] Leave approval notifications -- `b01b6e7`
- [x] Helpdesk ticket notifications -- `b01b6e7`
- [x] Service Health Dashboard -- `b53ac8f`
- [x] Data Sanity Checker (10 checks + auto-fix) -- `4d94b18`
- [x] System Notifications for Super Admin -- `b01b6e7`
- [x] Module Enable/Disable toggle -- `b01b6e7`
- [x] User Management in org detail (deactivate, reset password, change role) -- `b01b6e7`
- [x] RBAC fixes (employee data stripped, HR-only routes, own-only filters) -- `de6b3b7`
- [x] Health endpoints added to Projects and Monitor -- `b53ac8f`

---

## Still Open

### #546 — Onboarding Tasks for New Joiner
- Auto-assign onboarding checklist when new employee added
- Training modules from LMS auto-enrolled
- Progress tracking dashboard

### #548 — Buddy/Mentor Assignment
- Assign a buddy/mentor to new joiners
- Buddy gets notification
- Onboarding dashboard shows buddy info

---

*Last updated: 2026-03-28*
*Source: https://github.com/EmpCloud/EmpCloud/issues?q=is%3Aopen*
