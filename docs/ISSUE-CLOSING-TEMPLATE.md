# Issue Closing Template

Use this template for EVERY GitHub issue comment before closing.

---

## For FIXED bugs:

```
## Root Cause
<What was actually wrong — be specific, not "it was broken">

## Fix Applied
<What code logic was changed — describe the actual change>

## Files Modified
- `packages/server/src/path/to/file.ts` — description of change
- `packages/client/src/path/to/file.tsx` — description of change

## Commit
`<hash>` — <commit message>

## Screenshot (proof it works)
![Feature working](https://raw.githubusercontent.com/EmpCloud/EmpCloud/main/screenshots/verification/<name>.png)

## Verify
- URL: https://test-empcloud.empcloud.com/<path>
- Steps:
  1. Login as <role> (<email>)
  2. Navigate to <page>
  3. <action to verify>
  4. Expected: <what should happen>
```

---

## For FALSE POSITIVES (not a bug):

```
## Not a bug — verified

## Proof
<curl command output, HTTP status code, or screenshot showing it works>

## Why the bot reported it
<Wrong API path / rate limited / headless Chrome rendering / wrong request body>

## Actual correct behavior
<What the correct route/flow is>

## Screenshot
![Working](https://raw.githubusercontent.com/EmpCloud/EmpCloud/main/screenshots/verification/<name>.png)

## Verify
- URL: https://test-empcloud.empcloud.com/<path>
- Steps to confirm it works
```

---

## For SECURITY false positives (XSS/SQLi stored):

```
## Not a vulnerability

## Why it's safe
1. React JSX auto-escapes all rendered text — script tags display as plain text
2. Knex.js uses parameterized queries — SQL payloads stored as strings, never executed
3. No user sees raw API JSON — React renders escaped content

## Proof
Open <page> with the payload — it displays as text, no script executes.

## Screenshot
![Safe rendering](https://raw.githubusercontent.com/EmpCloud/EmpCloud/main/screenshots/verification/<name>.png)
```

---

## For SSO/MODULE LOGIN issues:

```
## Not a bug — SSO flow

## How module login works
1. Login at https://test-empcloud.empcloud.com
2. Go to Dashboard or /modules
3. Click "Launch" on the module
4. SSO token auto-authenticates — no separate login needed

## Why direct login fails
Users don't exist in module DB until first SSO from EMP Cloud. Direct URL access shows login page — this is expected.

## Proof
Login at EMP Cloud works:
curl -s POST /api/v1/auth/login → 200 with tokens

## Screenshot
![Dashboard with modules](https://raw.githubusercontent.com/EmpCloud/EmpCloud/main/screenshots/verification/employee_dashboard.png)
```

---

## RULES:
1. NEVER close without a comment
2. NEVER say just "Fixed" or "Not a bug" — always explain WHY
3. ALWAYS include a screenshot or curl proof
4. ALWAYS include verification steps
5. ALWAYS include commit ID for code fixes
6. ALWAYS include file paths for code changes
