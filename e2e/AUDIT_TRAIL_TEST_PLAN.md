# Audit Trail — End-to-End Test Plan

## Module Overview
Comprehensive audit logging system tracking 40+ action types across auth, user management, subscriptions, attendance, leave, documents, policies, and admin operations. All entries include actor, action, resource, IP address, and timestamp.

---

## Audit Action Types (40 Total)

### Auth & Session (8)
`USER_REGISTERED`, `USER_LOGIN`, `USER_LOGOUT`, `USER_LOGIN_FAILED`, `PASSWORD_CHANGED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `TOKEN_REFRESHED`

### User Management (6)
`USER_UPDATED`, `USER_DEACTIVATED`, `USER_ACTIVATED`, `USER_ROLE_CHANGED`, `USER_INVITED`, `USER_PASSWORD_RESET_BY_ADMIN`

### Organization (3)
`ORGANIZATION_CREATED`, `ORGANIZATION_UPDATED`, `ORGANIZATION_SETTINGS_UPDATED`

### Subscription & Billing (4)
`SUBSCRIPTION_CREATED`, `SUBSCRIPTION_CANCELLED`, `SUBSCRIPTION_RENEWED`, `SEAT_ASSIGNED`

### Attendance (3)
`ATTENDANCE_CHECK_IN`, `ATTENDANCE_CHECK_OUT`, `ATTENDANCE_REGULARIZATION`

### Leave (3)
`LEAVE_APPLIED`, `LEAVE_APPROVED`, `LEAVE_REJECTED`

### Documents (3)
`DOCUMENT_UPLOADED`, `DOCUMENT_VERIFIED`, `DOCUMENT_DELETED`

### Policies & Announcements (3)
`POLICY_PUBLISHED`, `POLICY_ACKNOWLEDGED`, `ANNOUNCEMENT_CREATED`

### Admin (4)
`ADMIN_DATA_SANITY_RUN`, `ADMIN_AUTO_FIX_APPLIED`, `SYSTEM_NOTIFICATION_CREATED`, `MODULE_STATUS_TOGGLED`

### Biometrics (3)
`BIOMETRIC_FACE_ENROLLED`, `BIOMETRIC_DEVICE_REGISTERED`, `BIOMETRIC_DEVICE_DECOMMISSIONED`

---

## Test Phases

### Phase 1: Audit Log Display

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Navigate to audit logs page | Log table loads |
| 2 | Columns: Actor, Action, Resource, IP, Timestamp | All visible |
| 3 | Sorted by timestamp (newest first) | Chronological DESC |
| 4 | Pagination (20/page) | Navigation works |
| 5 | Action types color-coded by category | Visual categorization |
| 6 | Actor shows user name/email | Identifiable |
| 7 | Resource shows entity type + ID | e.g., "User #42" |

### Phase 2: Auth Event Auditing

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 8 | Successful login → USER_LOGIN | Entry with user, IP, timestamp |
| 9 | Failed login → USER_LOGIN_FAILED | Entry with attempted email |
| 10 | Logout → USER_LOGOUT | Entry created |
| 11 | Register → USER_REGISTERED | Entry with new user ID |
| 12 | Password change → PASSWORD_CHANGED | Entry with user ID |
| 13 | Forgot password → PASSWORD_RESET_REQUESTED | Entry with email |
| 14 | Reset password → PASSWORD_RESET_COMPLETED | Entry with user ID |
| 15 | Token refresh → TOKEN_REFRESHED | Entry created |

### Phase 3: User Management Auditing

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 16 | Update user profile → USER_UPDATED | Entry with changed fields |
| 17 | Deactivate user → USER_DEACTIVATED | Entry with target user |
| 18 | Activate user → USER_ACTIVATED | Entry with target user |
| 19 | Change role → USER_ROLE_CHANGED | Entry with old→new role |
| 20 | Invite user → USER_INVITED | Entry with invited email |
| 21 | Admin reset password → USER_PASSWORD_RESET_BY_ADMIN | Entry with admin + target |

### Phase 4: Attendance & Leave Auditing

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 22 | Check-in → ATTENDANCE_CHECK_IN | Entry with time, method |
| 23 | Check-out → ATTENDANCE_CHECK_OUT | Entry with time |
| 24 | Regularization → ATTENDANCE_REGULARIZATION | Entry with request ID |
| 25 | Apply leave → LEAVE_APPLIED | Entry with leave type, dates |
| 26 | Approve leave → LEAVE_APPROVED | Entry with approver + leave ID |
| 27 | Reject leave → LEAVE_REJECTED | Entry with reason |

### Phase 5: Document & Policy Auditing

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 28 | Upload document → DOCUMENT_UPLOADED | Entry with doc name |
| 29 | Verify document → DOCUMENT_VERIFIED | Entry with verifier |
| 30 | Delete document → DOCUMENT_DELETED | Entry with doc ID |
| 31 | Publish policy → POLICY_PUBLISHED | Entry with policy name |
| 32 | Acknowledge policy → POLICY_ACKNOWLEDGED | Entry with user + policy |
| 33 | Create announcement → ANNOUNCEMENT_CREATED | Entry with title |

### Phase 6: Subscription Auditing

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 34 | Create subscription → SUBSCRIPTION_CREATED | Entry with module, plan |
| 35 | Cancel subscription → SUBSCRIPTION_CANCELLED | Entry with reason |
| 36 | Renew subscription → SUBSCRIPTION_RENEWED | Entry with period |
| 37 | Assign seat → SEAT_ASSIGNED | Entry with user + module |

### Phase 7: Admin Operation Auditing

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 38 | Run data sanity → ADMIN_DATA_SANITY_RUN | Entry with check count |
| 39 | Auto-fix applied → ADMIN_AUTO_FIX_APPLIED | Entry with fixes count |
| 40 | Create system notification → SYSTEM_NOTIFICATION_CREATED | Entry with type |
| 41 | Toggle module → MODULE_STATUS_TOGGLED | Entry with module + new status |

### Phase 8: Biometrics Auditing

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 42 | Enroll face → BIOMETRIC_FACE_ENROLLED | Entry with employee |
| 43 | Register device → BIOMETRIC_DEVICE_REGISTERED | Entry with device name |
| 44 | Decommission device → BIOMETRIC_DEVICE_DECOMMISSIONED | Entry with device |

### Phase 9: Filtering & Search

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 45 | Filter by action type | Only matching actions shown |
| 46 | Filter by category (auth, user, leave, etc.) | Category-based filtering |
| 47 | Filter by date range | Date-bounded results |
| 48 | Filter by actor (user) | User-specific actions |
| 49 | Filter by resource type | Entity-type filtering |
| 50 | Combine filters (type + date + actor) | Intersection results |
| 51 | Clear all filters | Reset to full log |
| 52 | Search by keyword | Text search across entries |

### Phase 10: Data Integrity

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 53 | Audit entries are immutable | No update/delete API |
| 54 | Timestamps are UTC | Consistent timezone |
| 55 | IP address captured correctly | Client IP (not proxy) |
| 56 | Organization-scoped (not cross-org) | Tenant isolation |
| 57 | Super admin sees all orgs' logs | Cross-org access |
| 58 | Sensitive data NOT in audit entries | No passwords/tokens logged |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/audit` | GET | List audit logs (paginated, filtered) |
| `/api/v1/admin/audit` | GET | Super admin: all orgs' logs |
| `/api/v1/admin/organizations/:id` | GET | Org-specific audit trail |

## Audit Entry Schema

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique entry ID |
| organization_id | UUID | Tenant scope |
| user_id | UUID | Actor who performed action |
| action | ENUM | One of 40 action types |
| resource_type | STRING | Entity type (user, leave, etc.) |
| resource_id | UUID | Affected entity ID |
| details | JSON | Additional context |
| ip_address | STRING | Client IP |
| created_at | TIMESTAMP | When action occurred |
