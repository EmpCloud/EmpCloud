# Surveys Module — End-to-End Test Plan

## Module Overview
Survey builder for pulse checks, eNPS, engagement surveys, and custom questionnaires. Supports 7 question types, anonymous mode, recurrence scheduling, and aggregate analytics with CSV export.

---

## Test Phases

### Phase 1: Survey Creation (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Create survey with title, description, type | Survey created in draft status |
| 2 | Add rating question (1-5) | Question saved with type + sort order |
| 3 | Add eNPS question (0-10) | eNPS type question added |
| 4 | Add yes/no question | Boolean question type |
| 5 | Add multiple choice question | Options parsed (one per line) |
| 6 | Add text (open-ended) question | Free-text type |
| 7 | Add scale question | Scale type saved |
| 8 | Mark question as required | Required flag set |
| 9 | Reorder questions (move up/down) | Sort order updated |
| 10 | Delete question (min 1 required) | Question removed, order adjusted |
| 11 | Set anonymous mode | is_anonymous = true |
| 12 | Set recurrence (weekly/monthly/quarterly) | Recurrence field saved |
| 13 | Set start and end dates | Date range validated (end >= start) |
| 14 | Target: all employees | target_audience = "all" |
| 15 | Target: by department | Department selection |
| 16 | Target: by role | Role selection |
| 17 | Save as draft | Status = draft |

### Phase 2: Survey Publishing & Lifecycle

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 18 | Publish draft survey | Status = active, visible to employees |
| 19 | Edit active survey | Blocked (draft only editing) |
| 20 | Close active survey | Status = closed, no new responses |
| 21 | Delete draft survey | Survey removed |
| 22 | Delete active survey | Blocked (close first) |

### Phase 3: Survey List Views

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 23 | HR views survey list | All surveys with status/type filters |
| 24 | Filter by status (draft/active/closed) | Correct surveys shown |
| 25 | Filter by type (pulse/enps/engagement/custom) | Type-specific list |
| 26 | Employee views active surveys | Only published surveys visible |
| 27 | Survey cards show: type, anonymous, due date | Correct metadata |
| 28 | Pagination (20/page) | Page navigation works |

### Phase 4: Survey Responding

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 29 | Employee opens active survey | Questions displayed in order |
| 30 | Answer rating question (click 1-5 buttons) | Rating recorded |
| 31 | Answer eNPS (0-10 scale) | Score with color coding (red/yellow/green) |
| 32 | Answer yes/no question | Boolean selection |
| 33 | Answer multiple choice | Radio button selection |
| 34 | Answer text question | Free-text input |
| 35 | Skip optional question | Allowed |
| 36 | Submit without required question | Validation error |
| 37 | Submit complete response | Success confirmation |
| 38 | Cannot respond twice to same survey | Blocked on second attempt |
| 39 | Anonymous survey disclaimer shown | Privacy notice visible |

### Phase 5: Response History

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 40 | Employee views response history | Past responses with survey name, type, date |
| 41 | Completed surveys marked | Clear visual indicator |

### Phase 6: Survey Results & Analytics (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 42 | View results for closed survey | Aggregated data displayed |
| 43 | Summary: response count, question count | Correct totals |
| 44 | eNPS score calculated | Promoters - Detractors percentage |
| 45 | eNPS breakdown: promoters/passives/detractors | Counts + percentages + bar |
| 46 | Rating distribution bar chart | Height-based visualization |
| 47 | Yes/No distribution | Two horizontal bars |
| 48 | Multiple choice distribution | Sorted by count descending |
| 49 | Text responses displayed | Scrollable list |
| 50 | Export results to CSV | CSV with questions, types, averages |

### Phase 7: Survey Dashboard (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 51 | Dashboard stat cards | Active surveys, total responses, avg rate, total count |
| 52 | eNPS score gauge | Color coded (green >=50, yellow 0-49, red <0) |
| 53 | Survey status breakdown | Draft, active, closed counts |
| 54 | Recent surveys table | Title, type, status, responses, date |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/surveys` | GET/POST | List/Create surveys |
| `/api/v1/surveys/:id` | GET/PUT/DELETE | Survey CRUD |
| `/api/v1/surveys/:id/publish` | POST | Publish survey |
| `/api/v1/surveys/:id/close` | POST | Close survey |
| `/api/v1/surveys/:id/respond` | POST | Submit response |
| `/api/v1/surveys/:id/results` | GET | Aggregated results |
| `/api/v1/surveys/active` | GET | Active surveys for employee |
| `/api/v1/surveys/dashboard` | GET | Analytics dashboard |
| `/api/v1/surveys/my-responses` | GET | Employee's past responses |

## Question Types

| Type | Input | Range |
|------|-------|-------|
| `rating_1_5` | Button group | 1-5 |
| `rating_1_10` | Button group | 1-10 |
| `enps_0_10` | Scale with colors | 0-10 (Detractor: 0-6, Passive: 7-8, Promoter: 9-10) |
| `yes_no` | Two buttons | Yes/No |
| `multiple_choice` | Radio buttons | Custom options |
| `text` | Textarea | Free text |
| `scale` | Slider | Configurable |

## Survey Types

`pulse` | `enps` | `engagement` | `custom` | `onboarding` | `exit_survey`

## Survey State Machine

```
Create → [DRAFT]
            ↓ Publish
         [ACTIVE]
            ↓ Close
         [CLOSED]
            ↓ Archive
         [ARCHIVED]
```
