# Settings & Organization — End-to-End Test Plan

## Module Overview
Organization configuration including company info, departments, locations, and platform settings. Only accessible to org admins and HR roles.

---

## Test Phases

### Phase 1: Company Information

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | View organization details | Name, legal name, email, phone, address shown |
| 2 | Edit company name | Change persists |
| 3 | Edit legal name | Change persists |
| 4 | Edit email, phone, contact number | Fields update |
| 5 | Edit country, state, city, zipcode | Address updates |
| 6 | Edit timezone | Timezone saved |
| 7 | Edit language preference | Language setting updated |
| 8 | Edit website URL | URL saved |
| 9 | Edit week start day | Configuration saved |
| 10 | Non-admin cannot edit company info | Edit controls hidden |

### Phase 2: Department Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 11 | List all departments | Departments shown with names |
| 12 | Create new department | Department added to list |
| 13 | Validation: duplicate department name | Error: already exists |
| 14 | Delete department (no employees) | Department removed |
| 15 | Delete department (with employees) | Blocked or handled gracefully |
| 16 | Department count in org stats | Matches actual count |

### Phase 3: Location Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 17 | List all locations | Locations with timezone info |
| 18 | Create location with name + timezone | Location added |
| 19 | Create location with address | Full address saved |
| 20 | Timezone validation | Only valid timezones accepted |
| 21 | Delete location (no employees) | Location removed |
| 22 | Location count in org stats | Matches actual count |

### Phase 4: Organization Stats

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 23 | View org stats | User count, department count, location count |
| 24 | Active subscriptions shown | Current module subscriptions |
| 25 | Stats match reality | Counts verified against data |

### Phase 5: Custom Fields

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 26 | Create text field definition | Field type, name, description saved |
| 27 | Create number field | Number type saved |
| 28 | Create date field | Date type saved |
| 29 | Create select field with options | Options stored |
| 30 | Create checkbox field | Boolean type |
| 31 | Mark field as required | Required flag set |
| 32 | Reorder fields | Display order updated |
| 33 | Update field definition | Changes persist |
| 34 | Field appears on employee profile | Custom fields tab populated |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/organizations/me` | GET/PUT | View/Update org info |
| `/api/v1/organizations/me/stats` | GET | Organization statistics |
| `/api/v1/organizations/me/departments` | GET/POST | List/Create departments |
| `/api/v1/organizations/me/departments/:id` | DELETE | Delete department |
| `/api/v1/organizations/me/locations` | GET/POST | List/Create locations |
| `/api/v1/organizations/me/locations/:id` | DELETE | Delete location |
| `/api/v1/custom-fields/definitions` | GET/POST | List/Create field definitions |
| `/api/v1/custom-fields/definitions/:id` | GET/PUT | View/Update field |
| `/api/v1/custom-fields/definitions/reorder` | PUT | Reorder fields |

## RBAC Matrix

| Action | Employee | HR Manager | HR Admin | Org Admin |
|--------|----------|------------|----------|-----------|
| View org info | No | Yes | Yes | Yes |
| Edit org info | No | No | No | Yes |
| Manage departments | No | No | No | Yes |
| Manage locations | No | No | No | Yes |
| Custom fields | No | Yes | Yes | Yes |
