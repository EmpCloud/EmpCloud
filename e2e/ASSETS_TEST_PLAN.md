# Assets Module — End-to-End Test Plan

## Module Overview
IT and physical asset inventory management with full lifecycle tracking (available → assigned → returned → retired/lost), category management, warranty tracking, and analytics dashboard.

---

## Test Phases

### Phase 1: Asset Categories (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Create category (e.g., "Laptops") | Name, description saved |
| 2 | Edit category name/description | Changes persist |
| 3 | Delete category | Category deactivated |
| 4 | List categories | Active categories shown |

### Phase 2: Asset CRUD (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 5 | Create asset with all fields | Name, category, serial, brand, model, condition saved |
| 6 | Set purchase date and cost | Stored in smallest currency unit |
| 7 | Set warranty expiry date | Expiry tracked |
| 8 | Validation: warranty before purchase date | Error shown |
| 9 | Edit asset details | Changes persist |
| 10 | Delete unassigned asset | Asset removed |
| 11 | Delete assigned asset | Blocked: must return first |
| 12 | List all assets | Paginated table (20/page) |
| 13 | Search by name, tag, serial number | Matching assets found |
| 14 | Filter by status | Available/Assigned/Retired/Lost filtered |
| 15 | Filter by category | Category-specific list |

### Phase 3: Asset Lifecycle

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 16 | Assign asset to employee | Status = assigned, employee linked |
| 17 | Assignment notes saved | Notes stored in history |
| 18 | Return asset with condition + notes | Status = available, condition updated |
| 19 | Retire asset with notes | Status = retired |
| 20 | Report asset as lost | Status = lost |
| 21 | Each action creates history entry | Timeline shows all actions |

### Phase 4: My Assets (Employee View)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 22 | Employee views assigned assets | Grid of asset cards |
| 23 | Card shows name, tag, condition, brand | Correct metadata |
| 24 | Warranty status visible | Warning if expiring |
| 25 | Click card opens detail | Full asset info |
| 26 | Employee with no assets | Empty state message |

### Phase 5: Asset Detail Page

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 27 | View asset info grid | Tag, category, serial, brand, model, etc. |
| 28 | Status and condition badges | Color-coded correctly |
| 29 | Assignment info (if assigned) | Assigned to, at, by |
| 30 | History timeline | Color-coded actions with timestamps |
| 31 | HR action buttons visible | Assign, Return, Retire, Report Lost |
| 32 | Employee sees limited actions | No management buttons |

### Phase 6: Warranty Tracking

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 33 | View expiring warranties (30 days) | Assets with soon-expiring warranties |
| 34 | Warning icon on expired warranties | Visual indicator in table |
| 35 | Dashboard shows warranty alerts | Top 5 expiring with links |

### Phase 7: Asset Dashboard (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 36 | KPI cards: Total, Available, Assigned, In Repair, Lost | Correct counts |
| 37 | Category breakdown chart | Bar chart with counts + percentages |
| 38 | Top assignees list | Ranked by asset count |
| 39 | Recent activity timeline | Latest actions with types + timestamps |
| 40 | "View All Assets" button | Navigates to asset list |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/assets/categories` | GET/POST | List/Create categories |
| `/api/v1/assets/categories/:id` | PUT/DELETE | Update/Delete category |
| `/api/v1/assets` | GET/POST | List/Create assets |
| `/api/v1/assets/:id` | GET/PUT/DELETE | Asset CRUD |
| `/api/v1/assets/my` | GET | Employee's assigned assets |
| `/api/v1/assets/dashboard` | GET | Dashboard stats |
| `/api/v1/assets/expiring-warranties` | GET | Warranty alerts |
| `/api/v1/assets/:id/assign` | POST | Assign to employee |
| `/api/v1/assets/:id/return` | POST | Return asset |
| `/api/v1/assets/:id/retire` | POST | Retire asset |
| `/api/v1/assets/:id/report-lost` | POST | Report lost |

## Asset State Machine

```
Create → [AVAILABLE]
              ↓ Assign
          [ASSIGNED]
              ↓ Return          ↓ Report Lost
          [AVAILABLE]         [LOST]
              ↓ Retire
          [RETIRED]
```

## Asset Condition Values

`new` | `good` | `fair` | `poor`

## History Action Colors

| Action | Color |
|--------|-------|
| Created | Green |
| Assigned | Blue |
| Returned | Purple |
| Repaired | Yellow |
| Retired | Gray |
| Lost | Red |
| Damaged | Orange |
| Updated | Indigo |
