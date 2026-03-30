---
name: Codebase health analysis (2026-03-29)
description: 78K LOC, 35 services, 35 routes, 94 pages, 34 migrations. Key risks and refactoring targets.
type: project
---

## Codebase: 78,003 LOC | 35 services | 35 routes | 94 pages | 34 migrations | 20 tests

## CRITICAL Issues
1. **44+ hardcoded localhost URLs** in health-check.service.ts (28), super-admin.service.ts (7) — will break in production
2. **184 raw SQL queries** across 21 services — SQL injection risk (super-admin has 47)
3. **Config default password = "secret"** in config/index.ts:41

## Complexity Hotspots (refactoring candidates)
- validators/index.ts: 1389 lines (split by domain)
- chatbot/tools.ts: 1262 lines (split into domain tool files)
- BillingPage.tsx: 1055 lines
- OnboardingWizard.tsx: 1036 lines
- EmployeeProfilePage.tsx: 996 lines
- helpdesk.service.ts: 919 lines
- biometrics.service.ts: 872 lines

## Test Coverage: LOW (~23% services covered)
- 20 test files for 78K LOC
- 0 client/React tests
- 0 E2E tests
- 77% services untested

## Type Safety: 210 `any` types across codebase

## Strengths
- Well-organized service layer (35 clear modules)
- Good error handling (486 try/catch, winston logging)
- Zod validation on all inputs
- Helmet + CORS + bcrypt security
- No console.log abuse (only 3 occurrences)
