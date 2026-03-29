# Wellness Module — End-to-End Test Plan

## Module Overview
Employee wellness platform with daily mood check-ins, energy/sleep/exercise tracking, personal wellness goals, wellness programs with enrollment, streak tracking, and HR analytics dashboard.

---

## Test Phases

### Phase 1: Daily Check-In

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Navigate to daily check-in page | Date displayed, mood picker shown |
| 2 | Select mood: great (😄) | Mood highlighted with ring |
| 3 | Select mood: good (🙂) | Selection updates |
| 4 | Select mood: okay (😐) | Selection updates |
| 5 | Select mood: low (😔) | Selection updates |
| 6 | Select mood: stressed (😰) | Selection updates |
| 7 | Set energy level (1-5 slider) | Visual fill updates |
| 8 | Enter sleep hours (decimal, 0-24) | Value accepted |
| 9 | Enter exercise minutes (integer) | Value accepted |
| 10 | Add optional notes | Notes saved |
| 11 | Submit without mood selected | Button disabled / error |
| 12 | Submit complete check-in | Success screen with links |
| 13 | Success links to My Wellness and Programs | Navigation works |

### Phase 2: My Wellness Dashboard

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 14 | Quick stats: Day Streak | Current consecutive check-in days |
| 15 | Quick stats: Total Check-ins | Lifetime count |
| 16 | Quick stats: Avg Energy | Average energy level |
| 17 | Quick stats: Goals Done | Completed goals count |
| 18 | Mood trend (14 days) | Emoji + mood label + date + energy per day |
| 19 | Color-coded mood backgrounds | Different colors per mood |
| 20 | Recent check-ins table (14 days) | Date, Mood, Energy (5 zaps), Sleep, Exercise |
| 21 | Missing values show "---" | No errors on empty data |

### Phase 3: Wellness Goals

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 22 | Create goal (title, type, frequency, target) | Goal created, status = active |
| 23 | Goal types via dropdown | Correct options available |
| 24 | Set target value and unit | Auto-filled unit from type |
| 25 | Set start/end dates | Date validation: end >= start |
| 26 | View goal cards | Title, status badge, type, frequency, progress |
| 27 | Update goal progress | Progress bar increments |
| 28 | Goal reaches target | Status = completed, green bar |
| 29 | View completed goals | Completed status badge |
| 30 | Goal progress bar visualization | Current/target percentage |

### Phase 4: Wellness Programs

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 31 | Browse program catalog | Grid of program cards |
| 32 | Filter by program type | Type-specific programs |
| 33 | Program card shows: title, type, description, dates | Correct info |
| 34 | Enrolled count / max shown | Capacity tracking |
| 35 | Points reward badge (if > 0) | Points displayed |
| 36 | Enroll in program | Enrollment recorded |
| 37 | Enrolled program shows in My Wellness | Listed under My Programs |
| 38 | Mark program complete | Status = completed, points awarded |
| 39 | Program progress percentage | Bar visualization |
| 40 | Pagination on program list | Page navigation |
| 41 | Empty state: no programs | Appropriate message |

### Phase 5: Wellness Summary

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 42 | Quick stats on main wellness page | Streak, Active Programs, Goals Completed, Latest Mood |
| 43 | "Daily Check-in" button | Navigates to check-in form |
| 44 | "My Wellness" button | Navigates to personal dashboard |

### Phase 6: HR Dashboard

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 45 | KPI cards: Wellness Score, Active Programs, Participants, Goal % | Correct values |
| 46 | Mood distribution chart (30 days) | Horizontal bars per mood with % |
| 47 | Average metrics: Energy, Exercise, Enrollments | Org-wide averages |
| 48 | Top programs table | Program, type, enrolled/max, points, status |
| 49 | Create program form (collapsible) | Title, description, type, dates, points |
| 50 | Create program | New program appears in catalog |
| 51 | No check-in data state | "No check-in data yet" message |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/wellness/check-in` | POST | Submit daily check-in |
| `/api/v1/wellness/check-ins` | GET | Check-in history |
| `/api/v1/wellness/my` | GET | My enrolled programs |
| `/api/v1/wellness/summary` | GET | Personal wellness summary |
| `/api/v1/wellness/dashboard` | GET | HR org-wide dashboard |
| `/api/v1/wellness/goals` | GET/POST | List/Create goals |
| `/api/v1/wellness/goals/:id` | PUT | Update goal progress |
| `/api/v1/wellness/programs` | GET/POST | List/Create programs |
| `/api/v1/wellness/programs/:id` | GET/PUT | Program detail/update |
| `/api/v1/wellness/programs/:id/enroll` | POST | Enroll in program |
| `/api/v1/wellness/programs/:id/complete` | POST | Complete program |

## Mood Values

| Mood | Emoji | Color |
|------|-------|-------|
| great | 😄 | Green |
| good | 🙂 | Light Green |
| okay | 😐 | Yellow |
| low | 😔 | Orange |
| stressed | 😰 | Red |

## Check-In Data Points

| Field | Type | Range |
|-------|------|-------|
| mood | enum | great/good/okay/low/stressed |
| energy_level | integer | 1-5 |
| sleep_hours | decimal | 0-24 (step 0.5) |
| exercise_minutes | integer | 0+ |
| notes | text | Optional |
