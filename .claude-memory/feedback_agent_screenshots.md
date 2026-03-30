---
name: No GitHub comments without screenshots or API proof
description: MANDATORY - every GitHub issue comment must include screenshot or API verification before closing
type: feedback
---

HARD RULE: No GitHub issue comment without screenshot or API verification proof. This applies to the main context AND all agents (bug fix agents, implementation agents).

**Why:** User requires visual/data proof that every bug is actually fixed. Text claims are not enough. "Previously addressed" without proof is not acceptable.

**How to apply:**
1. For API bugs: Run a curl command showing the fix works, paste the response in the comment
   - Format: `**Verified:** \`POST /feedback {category:"general"}\` → 201 {id: 98, category: "general"}`
2. For UI bugs: Take a screenshot, upload to repo, link in comment
   - Format: `**Screenshot:** ![fix](https://raw.githubusercontent.com/EmpCloud/EmpCloud/main/screenshots/fix_242.png)`
3. If you CANNOT verify (e.g., module is down), say so explicitly and keep the issue OPEN
4. NEVER close an issue without proof in the comment
5. This rule applies to: main conversation, bug fix agents, implementation agents — everyone
