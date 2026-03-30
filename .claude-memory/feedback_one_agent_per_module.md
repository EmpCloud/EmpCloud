---
name: One agent per module at a time — bugs first, then enhancements
description: Never run bug fix and implementation agents on same module simultaneously. Bugs first, then enhancements.
type: feedback
---

RULE: Only ONE agent works on ONE module at a time. Never run bug fix + implementation agents on the same module simultaneously — they'll create merge conflicts and code mess.

**Workflow per module:**
1. Check for verified-bug issues for that module
2. If bugs exist → launch bug fix agent
3. Wait for bug fix agent to complete
4. If no more bugs → check for enhancement/feature requests for that module
5. If enhancements exist → launch implementation agent
6. Repeat every 10 minutes via cron

**Why:** Two agents editing the same module's files simultaneously causes merge conflicts, overwrites, and duplicated code. Sequential processing ensures clean commits.

**How to apply:**
- Track which modules have active agents (use a mental map or todo list)
- Never launch a second agent for a module that already has one running
- Bug fixes take priority over enhancements
- Once bugs are clear for a module, THEN switch to enhancement mode
- The 10-min cron should check: bugs first → then enhancements → for each module
