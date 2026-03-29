# Forum Module — End-to-End Test Plan

## Module Overview
Community discussion platform with categorized posts (Discussion, Question, Idea, Poll), nested reply threads, like/engagement system, accepted answers, pinning/locking, and contributor analytics.

---

## Test Phases

### Phase 1: Forum Categories (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Create category with name, icon (emoji), description | Category created |
| 2 | Set sort order | Categories ordered correctly |
| 3 | Edit category | Changes persist |
| 4 | List categories | Grid with icon, name, post count, description |
| 5 | Category post count accurate | Matches actual posts |

### Phase 2: Post Creation (All Users)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 6 | Create Discussion post | Type = discussion, title + content saved |
| 7 | Create Question post | Type = question |
| 8 | Create Idea post | Type = idea |
| 9 | Create Poll post | Type = poll |
| 10 | Select category (required) | Category assigned |
| 11 | Add tags (comma-separated) | Tags stored and displayed |
| 12 | Validation: title required | Error if empty |
| 13 | Title max 255 characters | Enforced |

### Phase 3: Post Browsing & Search

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 14 | Forum page shows post feed | Cards with author, type, title, preview |
| 15 | Search posts by keyword | Matching posts returned |
| 16 | Sort by Recent | Newest first |
| 17 | Sort by Popular | Most liked first |
| 18 | Sort by Trending | Most engagement first |
| 19 | Filter by category | Category-specific posts |
| 20 | Post card shows: author, type badge, view/like/reply counts | Correct metadata |
| 21 | Pinned posts appear at top | Pin indicator shown |
| 22 | Locked posts show lock icon | Lock indicator shown |
| 23 | Pagination works | Page navigation |

### Phase 4: Post Detail & Engagement

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 24 | View post detail | Full content, author, timestamps |
| 25 | View count increments on visit | Counter updates |
| 26 | Like a post | Like count increments, button state changes |
| 27 | Unlike a post (toggle) | Like count decrements |
| 28 | Post shows tags | Tag badges displayed |

### Phase 5: Reply System

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 29 | Reply to post | Reply added to thread |
| 30 | Reply to a reply (nested) | Nested reply with parent indication |
| 31 | Reply shows author, timestamp, likes | Correct metadata |
| 32 | Like a reply | Reply like count increments |
| 33 | Delete own reply | Reply removed |
| 34 | HR deletes any reply | Reply removed |
| 35 | Cannot reply to locked post | Reply form hidden/disabled |

### Phase 6: Question-Specific Features

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 36 | Post author accepts a reply as answer | Reply marked as accepted |
| 37 | Accepted answer visually highlighted | Green checkmark/border |
| 38 | Only post author can accept answer | Button hidden for others |
| 39 | Only one accepted answer per question | Previous unaccepted on new accept |

### Phase 7: Post Moderation (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 40 | Pin post to top | Post stays at top of feed |
| 41 | Unpin post | Returns to normal sort position |
| 42 | Lock post (prevent replies) | Reply form disabled |
| 43 | Unlock post | Replies re-enabled |
| 44 | HR deletes any post | Post removed |
| 45 | Author edits own post | Content updated |
| 46 | Author deletes own post | Post removed |
| 47 | Non-author/non-HR cannot edit/delete | Buttons hidden |

### Phase 8: Category Posts Page

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 48 | Navigate to category | Category header with name + description |
| 49 | Filter by post type within category | Type-specific filtering |
| 50 | Sort within category | Recent/Popular/Active/Most Viewed |
| 51 | Pagination with total count | Correct page info |
| 52 | Back navigation to forum | Returns to main forum |

### Phase 9: Forum Dashboard (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 53 | Stats: Total Posts, Replies, Active This Week | Correct counts |
| 54 | Trending posts section | Ranked by engagement |
| 55 | Top contributors (30 days) | Users ranked by contribution count |
| 56 | Category management section | Create/edit categories inline |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/forum/categories` | GET/POST | List/Create categories |
| `/api/v1/forum/categories/:id` | PUT | Update category |
| `/api/v1/forum/posts` | GET/POST | List/Create posts |
| `/api/v1/forum/posts/:id` | GET/PUT/DELETE | Post CRUD |
| `/api/v1/forum/posts/:id/reply` | POST | Reply to post |
| `/api/v1/forum/posts/:id/pin` | POST | Pin/unpin post |
| `/api/v1/forum/posts/:id/lock` | POST | Lock/unlock post |
| `/api/v1/forum/replies/:id` | DELETE | Delete reply |
| `/api/v1/forum/replies/:id/accept` | POST | Accept as answer |
| `/api/v1/forum/like` | POST | Toggle like (post or reply) |
| `/api/v1/forum/dashboard` | GET | Forum stats |

## Post Types

`discussion` | `question` | `idea` | `poll`

## Post Moderation States

```
Normal Post:     [VISIBLE] ↔ [PINNED]
                 [VISIBLE] ↔ [LOCKED]
                 [VISIBLE] → [DELETED]

Question Post:   All above + accepted answer marking
```
