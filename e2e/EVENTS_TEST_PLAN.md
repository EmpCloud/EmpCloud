# Events Module — End-to-End Test Plan

## Module Overview
Company event management with RSVP functionality, event types (meetings, training, celebrations), attendance tracking, mandatory events, and virtual meeting links.

---

## Test Phases

### Phase 1: Event Creation (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Create event with all fields | Title, description, type, dates, location saved |
| 2 | Set event type: meeting | Type badge displayed |
| 3 | Set event type: training | Type badge displayed |
| 4 | Set event type: celebration | Type badge displayed |
| 5 | Set event type: team_building | Type badge displayed |
| 6 | Set event type: town_hall | Type badge displayed |
| 7 | Mark as mandatory | Mandatory badge (red star) shown |
| 8 | Mark as all-day event | Time fields hidden, all-day label shown |
| 9 | Add virtual meeting link | Clickable URL displayed |
| 10 | Set max attendees | Capacity tracked |
| 11 | Target: all employees | Available to everyone |
| 12 | Target: specific department | Only department sees event |
| 13 | Validation: end date before start | Error shown |

### Phase 2: Event Listing (All Users)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 14 | View events list page | Event cards with metadata |
| 15 | Filter by event type | Type-specific events |
| 16 | Filter by status (upcoming/ongoing/completed/cancelled) | Status-specific list |
| 17 | Event card shows: type badge, title, date, location | Correct info displayed |
| 18 | Attendee count shown | Current/max attendees |
| 19 | Mandatory badge visible | Red star on mandatory events |
| 20 | Pagination works | Page navigation |
| 21 | HR sees "Manage Events" button | Dashboard link visible |

### Phase 3: RSVP Functionality

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 22 | RSVP: Attending | Status = attending, count increments |
| 23 | RSVP: Maybe | Status = maybe |
| 24 | RSVP: Decline | Status = declined |
| 25 | Change RSVP from Attending to Maybe | Status updates |
| 26 | Cancel RSVP (set to declined) | Count decrements |
| 27 | RSVP buttons show active state | Current status highlighted |
| 28 | Max attendees reached | Further RSVPs may be blocked |

### Phase 4: Event Detail Page

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 29 | View event detail | Full event info displayed |
| 30 | Type badge and status badge | Correct badges |
| 31 | Mandatory badge if applicable | Red star shown |
| 32 | Date/time formatted | Full datetime or "All Day" |
| 33 | Location displayed | Venue info shown |
| 34 | Virtual link clickable | Opens in new tab |
| 35 | RSVP section visible | 3 buttons (Attending/Maybe/Decline) |
| 36 | Current RSVP highlighted | Active state styling |
| 37 | Attendee lists by status | "Attending" and "Maybe" sections |
| 38 | No RSVP for cancelled/completed events | RSVP section hidden |

### Phase 5: My Events (All Users)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 39 | View RSVPd events only | Events where user responded |
| 40 | RSVP status badge shown | Attending/Maybe badge |
| 41 | Cancel RSVP from My Events | Status changed, removed from list |
| 42 | Empty state with "Browse Events" | Link to full events list |

### Phase 6: Event Dashboard (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 43 | KPI cards: Upcoming, This Month, Total RSVPs, Types | Correct counts |
| 44 | Event type breakdown badges | Count per type |
| 45 | Create event form (collapsible) | Full creation form |
| 46 | Upcoming events table | Title, date, attendees, actions |
| 47 | Cancel event action | Event status = cancelled |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/events` | GET/POST | List/Create events |
| `/api/v1/events/upcoming` | GET | Upcoming events |
| `/api/v1/events/my` | GET | My RSVPd events |
| `/api/v1/events/dashboard` | GET | Dashboard stats |
| `/api/v1/events/:id` | GET/PUT/DELETE | Event CRUD |
| `/api/v1/events/:id/rsvp` | POST | RSVP to event |
| `/api/v1/events/:id/cancel` | POST | Cancel event |

## Event Types

`meeting` | `training` | `celebration` | `team_building` | `town_hall` | `holiday` | `workshop` | `social` | `other`

## Event Status Flow

```
Create → [UPCOMING]
            ↓ Start date passes
         [ONGOING]
            ↓ End date passes      ↓ HR cancels
         [COMPLETED]            [CANCELLED]
```

## RSVP States

```
No RSVP → [ATTENDING] ↔ [MAYBE] ↔ [DECLINED]
```
