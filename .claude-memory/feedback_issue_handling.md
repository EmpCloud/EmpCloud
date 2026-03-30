---
name: GitHub Issue Handling Process
description: When fixing GitHub issues, always comment the fix details and commit ID on the issue before closing
type: feedback
---

When fixing bugs from GitHub issues, follow this process:

1. Fix the bug in code
2. Commit with a descriptive message referencing the issue
3. **Comment on the GitHub issue** with ALL of the following:
   - **Root cause** — what was actually wrong (not just "fixed")
   - **Fix applied** — what code logic was changed
   - **Files modified** — exact file paths
   - **Commit ID** — full hash with link
   - **Test URL** — where to verify the fix
4. Only then close the issue

**Why:** On 2026-03-27, user pointed out that issues were being closed with vague one-liners like "Not a bug" or "Fixed". Testers and future developers need to understand WHAT was wrong, HOW it was fixed, and WHERE to verify.

**How to apply:** Use this template for EVERY issue comment:

```
## Root Cause
<what was actually wrong>

## Fix Applied
<what code logic was changed>

## Files Modified
- `packages/server/src/path/to/file.ts` — description of change
- `packages/client/src/path/to/file.tsx` — description of change

## Commit
`<hash>` — <commit message>

## Deployed
Test: https://test-empcloud.empcloud.com
Verify: <specific steps to test>
```

NEVER close an issue with just "Fixed" or "Not a bug" — always explain WHY.

## CRITICAL RULE: NEVER close issues as "not_planned"
Every issue must be closed as "completed" with state_reason="completed".
Use: `{"state":"closed","state_reason":"completed"}`
NEVER use: `{"state":"closed"}` alone (defaults to not_planned)

**Why:** On 2026-03-28, 96 issues were accidentally closed as "not_planned" because the GitHub API defaults to that reason. The user explicitly stated: "there should be nothing as not planned in this project, everything is built as per the plan."

## VERIFY COMMENTS POSTED
After posting a comment via GitHub API, ALWAYS verify it actually posted:
1. Check the issue's comments endpoint: GET /issues/:id/comments
2. Verify the count is > 0
3. If 0, retry with 0.5s delay

**Why:** GitHub API sometimes silently drops comments when posting too fast with -o /dev/null. The curl succeeds (exits 0) but the comment is not created. Always use visible output or check the response body for the comment ID.

## SIGNATURE
Always end every GitHub issue comment with:
— Comment by coding agent

This identifies which comments came from the AI coding agent vs human developers.

## VERIFY BEFORE CLOSING
NEVER close a bug without testing it works first.
1. Fix the code
2. Deploy to server
3. Test via API call or curl to VERIFY the fix works
4. Only THEN close

**Why:** On 2026-03-28, bugs were closed without verification multiple times. The user explicitly said "they are NOT fixed, test them before closing" and "verify working before closing a bug". This caused trust issues and wasted time reopening.

**How to apply:** After deploying a fix, make an actual API call or curl request to verify the endpoint/feature works correctly. Print the result. If it fails, don't close — investigate further.

## PURGE CACHE ON EVERY DEPLOYMENT
After deploying code to server, ALWAYS:
1. pm2 delete empcloud
2. rm -rf node_modules/.cache
3. pm2 start "npx tsx src/index.ts" --name empcloud
4. pm2 save
5. Wait 10 seconds for boot
6. Test the fix via API

**Why:** PM2 + tsx caches transpiled code. pm2 restart does NOT pick up new code. Only pm2 delete + pm2 start forces a fresh transpilation.
