---
name: Never rebuild existing features
description: Always check IMPLEMENTATIONS.md before coding — do not duplicate what already exists
type: feedback
---

Think like a senior engineer. Before writing ANY code, check IMPLEMENTATIONS.md for what's already built. Do NOT rebuild existing features.

**Why:** The platform has 30+ features already implemented across 25+ route files and 20+ service files. Rebuilding causes regressions, duplicated routes, and wasted time. The automated test bot creates issues for things that already work — always verify before coding.

**How to apply:**
1. When a new issue/task arrives, first check IMPLEMENTATIONS.md log
2. If the feature/endpoint already exists, close the issue with a comment — don't re-implement
3. When spinning up implementation agents, include the "already built" list in the prompt
4. Read existing code before modifying — extend patterns, don't reinvent
5. The full route inventory is in IMPLEMENTATIONS.md under "Critical Note for All Implementation Agents"
