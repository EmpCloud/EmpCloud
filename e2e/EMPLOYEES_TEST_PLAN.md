# Employees Module — End-to-End Test Plan

## Module Overview
Core HRMS module for managing employee directory, profiles (personal info, education, experience, dependents, addresses), probation tracking, salary structure, org chart, and bulk import.

---

## Test Phases

### Phase 1: Employee Directory

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Navigate to `/employees` as HR | Employee table loads with pagination (20/page) |
| 2 | Search by employee name | Table filters to matching employees |
| 3 | Search by email | Table filters correctly |
| 4 | Filter by department dropdown | Only department employees shown |
| 5 | Verify table columns | Name, email, department, designation, emp_code, status visible |
| 6 | Click employee row | Navigates to employee profile page |
| 7 | Pagination: next/previous | Loads correct page of results |
| 8 | Total employee count displayed | Count matches actual active employees |
| 9 | Employee view: can see directory | Directory visible to all authenticated users |

### Phase 2: Employee Profile — Personal Tab

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 10 | View own profile at `/employees/:id` | Profile loads with personal data |
| 11 | HR views another employee's profile | Full profile accessible |
| 12 | Employee views another's profile | Limited/blocked access (RBAC) |
| 13 | Edit personal email, blood group, marital status | Fields update on save |
| 14 | Edit nationality, Aadhar, PAN | Fields persist correctly |
| 15 | Edit passport number + expiry date | Both fields saved |
| 16 | Edit visa status + expiry | Fields saved |
| 17 | Edit emergency contact (name, phone, relation) | Contact info updated |
| 18 | Edit notice period (days) | Value persists |
| 19 | Upload profile photo (JPEG, < 5MB) | Photo uploads and displays |
| 20 | Upload oversized photo (> 5MB) | Error: file too large |
| 21 | Upload invalid format (e.g., .exe) | Error: invalid file type |

### Phase 3: Employee Profile — Education Tab

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 22 | Add education record | Degree, institution, field, years saved |
| 23 | Add multiple education records | All records display in list |
| 24 | Edit an education record | Changes persist |
| 25 | Delete an education record | Record removed from list |
| 26 | Validation: missing required fields | Error messages shown |

### Phase 4: Employee Profile — Experience Tab

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 27 | Add work experience | Company, designation, dates, description saved |
| 28 | Add multiple experience records | All records listed |
| 29 | Edit experience record | Changes persist |
| 30 | Delete experience record | Record removed |
| 31 | Validation: end date before start date | Error shown |

### Phase 5: Employee Profile — Dependents Tab

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 32 | Add dependent | Name, relation, DOB, gender saved |
| 33 | Relation dropdown options | Spouse, Child, Parent, etc. available |
| 34 | Add multiple dependents | All listed |
| 35 | Edit dependent | Changes saved |
| 36 | Delete dependent | Removed from list |

### Phase 6: Employee Profile — Addresses Tab

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 37 | Add current address | Type, line1, city, state, country, zipcode saved |
| 38 | Add permanent address | Separate record created |
| 39 | Edit address | Changes persist |
| 40 | Delete address | Record removed |
| 41 | Non-India address | Country field accepts international values |

### Phase 7: Probation Tracking (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 42 | Navigate to `/employees/probation` | Probation dashboard loads |
| 43 | Dashboard stats: 4 cards | On Probation, Upcoming, Confirmed This Month, Overdue counts |
| 44 | Probation list shows employees | Name, emp_code, start/end dates, days remaining, status |
| 45 | Days remaining color coding | Red <7d, Orange 7-15d, Yellow 15-30d, Green >30d |
| 46 | Confirm probation for employee | Status changes to "Confirmed" |
| 47 | Extend probation with new end date + reason | Status "Extended", new end date set |
| 48 | View upcoming confirmations (30 days) | Correct employees listed |
| 49 | Employee cannot access probation page | Redirect or 403 |

### Phase 8: Salary Structure (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 50 | View salary tab on employee profile | Salary fields visible (CTC, basic, HRA, DA, etc.) |
| 51 | HR edits salary structure | All 9 fields save in paise |
| 52 | Employee views own salary | Read-only access |
| 53 | Employee cannot edit salary | Edit controls hidden/disabled |

### Phase 9: Organization Chart

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 54 | Navigate to org chart page | Hierarchical tree renders |
| 55 | Root node shows top-level manager | Correct reporting structure |
| 56 | Expand tree node | Children nodes reveal |
| 57 | Click employee node | Navigates to profile |
| 58 | Node shows designation + department | Info displayed correctly |
| 59 | Children count badge | Correct subordinate count |

### Phase 10: Bulk Import

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 60 | Upload valid CSV | Preview shows parsed rows |
| 61 | CSV with validation errors | Row-by-row errors displayed |
| 62 | Execute import with valid data | Employees created, success count shown |
| 63 | Upload non-CSV file | Error: invalid format |
| 64 | CSV with duplicate emails | Validation errors on duplicates |

### Phase 11: Organizational Insights

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 65 | Upcoming birthdays endpoint | Returns employees with upcoming birthdays |
| 66 | Work anniversaries endpoint | Returns employees with anniversaries |
| 67 | Headcount stats | Organization-wide headcount numbers |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/employees` | GET | Employee directory with search/filter |
| `/api/v1/employees/directory` | GET | Directory listing |
| `/api/v1/employees/:id/profile` | GET/PUT | Employee profile CRUD |
| `/api/v1/employees/:id/photo` | GET | Retrieve profile photo |
| `/api/v1/employees/:id/education` | POST/PUT/DELETE | Education records CRUD |
| `/api/v1/employees/:id/experience` | POST/PUT/DELETE | Experience records CRUD |
| `/api/v1/employees/:id/dependents` | POST/PUT/DELETE | Dependents CRUD |
| `/api/v1/employees/:id/addresses` | POST/PUT/DELETE | Addresses CRUD |
| `/api/v1/employees/:id/salary` | GET/PUT | Salary structure |
| `/api/v1/employees/probation` | GET | Probation list |
| `/api/v1/employees/probation/dashboard` | GET | Probation stats |
| `/api/v1/employees/probation/upcoming` | GET | Upcoming confirmations |
| `/api/v1/employees/:id/probation/confirm` | PUT | Confirm probation |
| `/api/v1/employees/:id/probation/extend` | PUT | Extend probation |
| `/api/v1/employees/birthdays` | GET | Upcoming birthdays |
| `/api/v1/employees/anniversaries` | GET | Work anniversaries |
| `/api/v1/employees/headcount` | GET | Headcount stats |
| `/api/v1/users/import` | POST | CSV preview |
| `/api/v1/users/import/execute` | POST | Execute bulk import |

## RBAC Matrix

| Action | Employee | HR Manager | HR Admin | Org Admin |
|--------|----------|------------|----------|-----------|
| View directory | Yes | Yes | Yes | Yes |
| View own profile | Yes | Yes | Yes | Yes |
| Edit own profile | Yes | Yes | Yes | Yes |
| View others' profile | No | Yes | Yes | Yes |
| Edit others' profile | No | Yes | Yes | Yes |
| Probation management | No | Yes | Yes | Yes |
| Salary edit | No | Yes | Yes | Yes |
| Bulk import | No | Yes | Yes | Yes |
