---
name: NEVER close/comment on a bug without screenshots or API proof
description: CRITICAL RULE - every GitHub comment must include screenshot or curl proof. No exceptions. Applies to ALL agents.
type: feedback
---

HARD RULE: Every single GitHub issue comment MUST include a screenshot or API verification proof. No exceptions. This applies to the main context, bug fix agents, AND implementation agents.

**Why:** We were closing issues claiming they were "fixed" without verifying. When tested, 0 out of 31 endpoints actually worked. Implementation agents were posting comments without any proof. The user explicitly said: "implementation agent is not posting screenshots, add a rule to add screenshots in every comment."

**How to apply — for ALL agents (bug fix, implementation, coding):**

1. After building/fixing: run an actual `curl` command against the live test URL
2. Capture the full response (status code + body snippet)
3. Include it in the GitHub comment as a code block:
   ```
   **Verified:**
   $ curl -s https://test-empcloud-api.empcloud.com/api/v1/employees/522/salary
   → 200 {"success":true,"data":{"ctc":200000,"basic":80000,...}}
   ```
4. For UI changes: take a screenshot, upload to repo under screenshots/ folder, include the image link:
   ```
   **Screenshot:** ![salary-api](https://raw.githubusercontent.com/EmpCloud/EmpCloud/main/screenshots/salary_api_200.png)
   ```
5. If the endpoint returns non-200 or DNS fails: DO NOT close. Note the failure in the comment.
6. NEVER post a comment that just says "Built" or "Fixed" without proof.

**For implementation agents specifically:**
- After building a feature, the agent MUST test it via curl
- The curl output goes into the GitHub comment
- Format: what was built + files + commit + PROOF (curl output or screenshot)
- The main context must verify agent comments include proof before posting

**Template for every GitHub comment:**
```
**What:** [description of fix/feature]
**Files:** [list of files]
**Commit:** [hash]

**Proof:**
$ curl -s -H "Authorization: Bearer $JWT" https://test-empcloud-api.empcloud.com/api/v1/[endpoint]
→ [status code] [response body snippet]

-- Comment by [bug fix agent / implementation agent / coding agent]
```
