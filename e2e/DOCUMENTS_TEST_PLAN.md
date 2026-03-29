# Documents Module — End-to-End Test Plan

## Module Overview
Manages document categories, employee document uploads (PDF, images, DOCX), verification/rejection workflows, mandatory document tracking, and expiry alerts.

---

## Test Phases

### Phase 1: Document Categories (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Create category (e.g., "ID Proof") | Name, description, mandatory flag saved |
| 2 | Create mandatory category | is_mandatory = true |
| 3 | Edit category name/description | Changes persist |
| 4 | Delete category with no documents | Category deactivated |
| 5 | Delete category with existing documents | Blocked: validation error |
| 6 | List all categories | Active categories shown with mandatory badge |

### Phase 2: Document Upload

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 7 | Employee uploads own document (PDF) | File saved, record created, status = pending |
| 8 | Employee uploads JPG document | Accepted, MIME type recorded |
| 9 | Employee uploads DOCX document | Accepted |
| 10 | HR uploads document for another employee | uploaded_by = HR user, user_id = target |
| 11 | Set expiry date on upload | expires_at saved |
| 12 | Upload without selecting category | Validation error: category required |
| 13 | File size and MIME type stored | Metadata recorded in DB |

### Phase 3: Document Verification (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 14 | HR verifies document with remarks | verification_status = "verified", remarks saved |
| 15 | HR rejects document with reason | verification_status = "rejected", reason saved |
| 16 | Employee sees rejection reason | Rejection reason visible in My Documents |
| 17 | Employee re-uploads after rejection | New document replaces rejected one |
| 18 | HR re-verifies after re-upload | Status back to "verified" |

### Phase 4: My Documents (Employee View)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 19 | Employee views own documents | Card grid with name, category, status |
| 20 | Download own document | File downloads correctly |
| 21 | See expiry warning (≤30 days) | Orange/red visual indicator |
| 22 | See verification status badge | Verified (green), Pending (yellow), Rejected (red) |
| 23 | Pagination works | Navigate through pages |

### Phase 5: All Documents (HR View)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 24 | HR views all org documents | Table with all employees' documents |
| 25 | Search by employee ID | Filters to specific employee |
| 26 | Filter by category | Only selected category shown |
| 27 | Download any employee's document | File downloads |
| 28 | Delete a document | Physical file removed, record deleted |

### Phase 6: Mandatory Document Tracking

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 29 | View missing mandatory docs | Employees without required docs listed |
| 30 | Employee uploads mandatory doc | No longer shows as missing |
| 31 | Summary counts accurate | Missing count matches reality |

### Phase 7: Expiry Tracking

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 32 | View expiring documents (30 days) | Docs expiring within threshold listed |
| 33 | Color coding: green (>30d) | Normal display |
| 34 | Color coding: orange (≤30d) | Warning indicator |
| 35 | Color coding: red (expired) | Expired indicator |
| 36 | Custom days parameter | `?days=60` extends threshold |

### Phase 8: Access Control

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 37 | Employee cannot see others' documents | Only own docs in My Documents |
| 38 | Employee cannot verify/reject | Verify/reject buttons hidden |
| 39 | Employee cannot delete documents | Delete button hidden |
| 40 | HR can access all document operations | Full CRUD + verify/reject |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/documents/categories` | GET/POST | List/Create categories |
| `/api/v1/documents/categories/:id` | PUT/DELETE | Update/Delete category |
| `/api/v1/documents` | GET | All documents (HR) |
| `/api/v1/documents/upload` | POST | Upload document (multipart) |
| `/api/v1/documents/my` | GET | Employee's own documents |
| `/api/v1/documents/expiring` | GET | Expiring documents |
| `/api/v1/documents/mandatory-status` | GET | Mandatory tracking |
| `/api/v1/documents/:id` | GET/DELETE | View/Delete document |
| `/api/v1/documents/:id/download` | GET | Download file |
| `/api/v1/documents/:id/verify` | PUT | Verify document |
| `/api/v1/documents/:id/reject` | POST | Reject document |

## Document State Machine

```
Upload → [PENDING]
            ↓ HR Verify         ↓ HR Reject
         [VERIFIED]           [REJECTED]
                                 ↓ Employee Re-uploads
                              [PENDING] (new document)
```

## Accepted File Types

| Format | MIME Type |
|--------|-----------|
| PDF | application/pdf |
| JPEG | image/jpeg |
| PNG | image/png |
| DOCX | application/vnd.openxmlformats-officedocument.wordprocessingml.document |
