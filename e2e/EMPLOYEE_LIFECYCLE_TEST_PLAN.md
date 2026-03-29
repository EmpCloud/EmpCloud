# Employee Lifecycle — End-to-End Test Plan

## Module Overview
Full employee journey integration test: Invitation → Onboarding → Probation → Active Employment (attendance, leave, documents) → Role Changes → Exit. Tests the complete flow across multiple modules working together.

---

## Test Phases

### Phase 1: Invitation & Onboarding

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | HR sends invitation to new hire | Invitation created, email sent |
| 2 | New hire accepts invitation | User account + employee profile created |
| 3 | Employee code auto-generated | Unique EMP-{org}-{seq} format |
| 4 | Department and location assigned | From invitation data |
| 5 | Probation period initialized | 6-month probation starts |
| 6 | Default leave balances created | Per org's leave policy |
| 7 | Default shift assigned | If org has default shift |
| 8 | Employee appears in directory | Searchable in employee list |
| 9 | Employee visible in org chart | Under correct manager |
| 10 | Welcome notification received | In-app notification |

### Phase 2: Probation Period

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 11 | Probation status = on_probation | Visible in profile |
| 12 | Probation end date calculated | Join date + 6 months |
| 13 | Employee on probation can check-in | Attendance works |
| 14 | Employee on probation can apply leave | Leave works (may have reduced balances) |
| 15 | HR reviews probation | Review form accessible |
| 16 | Confirm employee (pass probation) | Status → confirmed |
| 17 | Extend probation | New end date set, status stays on_probation |
| 18 | Terminate during probation | Status → terminated, user deactivated |
| 19 | Probation dashboard shows pending reviews | HR sees upcoming |

### Phase 3: Active Employment — Daily Operations

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 20 | Employee checks in | Attendance record created |
| 21 | Employee checks out | Check-out time + worked_minutes |
| 22 | Employee applies for casual leave | Application created, pending approval |
| 23 | Manager approves leave | Status → approved, balance decremented |
| 24 | Employee uploads mandatory document | Document saved, pending verification |
| 25 | HR verifies document | Document → verified |
| 26 | Employee reads announcement | Read tracking updated |
| 27 | Employee acknowledges policy | Acknowledgment recorded |
| 28 | Employee submits helpdesk ticket | Ticket created |
| 29 | Employee attends event (RSVP) | RSVP recorded |
| 30 | Employee fills wellness check-in | Check-in saved |

### Phase 4: Role Transition — Employee to Manager

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 31 | Admin changes role: employee → manager | Role updated |
| 32 | Direct reports assigned | Reporting relationship set |
| 33 | Manager dashboard accessible | /manager page loads |
| 34 | Manager sees team attendance | Direct reports' status |
| 35 | Manager can approve team leaves | Approval actions available |
| 36 | Manager sees team leave calendar | Calendar shows team data |
| 37 | Previous employee-only views still work | Self-service intact |

### Phase 5: Role Transition — Manager to HR Admin

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 38 | Admin changes role: manager → hr_admin | Role updated |
| 39 | HR dashboard accessible | HR-specific pages load |
| 40 | Can manage all employees | Not just direct reports |
| 41 | Can approve documents | Verification capability |
| 42 | Can manage leave types/policies | Leave admin access |
| 43 | Can manage shifts | Shift admin access |
| 44 | Can send invitations | Invite capability |
| 45 | Can access biometrics management | If module active |

### Phase 6: Department/Location Transfer

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 46 | Transfer employee to new department | Department updated |
| 47 | Org chart reflects transfer | New position shown |
| 48 | Manager assignment may change | New reporting line |
| 49 | Transfer to new location | Location updated |
| 50 | Geo-fence changes for attendance | New location rules |

### Phase 7: Employee Exit

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 51 | Initiate exit process | Exit workflow starts |
| 52 | Exit date set | Last working day defined |
| 53 | Leave balance calculation | Remaining balance computed |
| 54 | Pending leaves cancelled | Active leaves voided |
| 55 | Asset return tracked | If assets module active |
| 56 | Final attendance processed | Last day recorded |
| 57 | User account deactivated | Cannot login after exit |
| 58 | Employee marked as inactive | Removed from active directory |
| 59 | Org user count decremented | Count updated |
| 60 | Seat freed in subscriptions | Seat available for new hire |
| 61 | Audit trail: complete history | All actions from invite to exit |

### Phase 8: Full Lifecycle Verification

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 62 | Audit log shows complete journey | invite → register → check-ins → leave → role changes → exit |
| 63 | No orphaned records after exit | All FKs resolved |
| 64 | Rehire scenario | New invitation, new employee profile |
| 65 | Historical data preserved | Old records still queryable |

---

## Lifecycle State Machine

```
Invited → Registered → On Probation → Confirmed → Active → Exited
                          ↓                ↓
                     Extended          Role Changed
                          ↓                ↓
                     Terminated      Dept/Location Transfer
```

## Cross-Module Touchpoints

| Lifecycle Event | Modules Affected |
|----------------|-----------------|
| Onboarding | Auth, Employee, Leave, Attendance, Notifications |
| Daily Work | Attendance, Leave, Documents, Helpdesk |
| Role Change | Auth (RBAC), Manager Dashboard, Employee Profile |
| Transfer | Employee, Attendance (geo), Org Chart |
| Exit | Auth, Employee, Leave, Assets, Subscriptions, Attendance |

## Key Verification Points

| # | Checkpoint | What to Verify |
|---|-----------|---------------|
| 1 | Post-invitation | User + profile + probation + balances created |
| 2 | Post-confirmation | Probation status updated, full access |
| 3 | Post-role-change | New permissions active, old ones removed |
| 4 | Post-transfer | New dept/location reflected everywhere |
| 5 | Post-exit | Account disabled, records preserved, seats freed |
