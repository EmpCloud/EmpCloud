# Feature Requests — Implementation TODOs

Collected from GitHub issues. To be planned and prioritized together.

## Priority: High

### #563 — Bulk Approval, Export, Probation Tracking
- Bulk approve/reject leave requests (select multiple → approve all)
- Export employee data, attendance, leave to CSV/Excel
- Probation period tracking with auto-alerts before confirmation date

### #556 — Employee Self-Service Profile Editing
- Employee can edit their own profile (name, phone, address, emergency contact)
- Changes submitted as "update request" for HR approval
- Currently employees can only view, admin must edit

### #564 — Mobile Responsive / Hamburger Menu
- Sidebar not accessible on mobile (375px viewport)
- Add hamburger menu toggle for mobile view
- Make all pages responsive

## Priority: Medium

### #499 — Audit Log Filter Controls
- Filter by: action type, user, date range, resource type
- Currently shows all events in reverse chronological order
- Need dropdowns + date pickers on /audit page

### #519 — Create Organization from Super Admin
- Super Admin can currently view/manage existing orgs
- Add "Create Organization" button on /admin/organizations
- Form: org name, admin email, plan tier

### #520 — Platform Settings UI
- SMTP configuration (host, port, user, password)
- Security policies (password rules, session timeout, 2FA)
- Timezone configuration
- Currently all configured via .env files

### #545 — Team Attendance Date Range Filter
- /attendance dashboard shows today only
- Add date range picker to view historical attendance
- Filter by department, date range

## Priority: Low

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
