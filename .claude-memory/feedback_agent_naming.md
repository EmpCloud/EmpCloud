---
name: Agents must identify themselves in GitHub comments
description: Bug fix agents sign as "bug fix agent", implementation agents as "implementation agent" in issue comments
type: feedback
---

Every GitHub issue comment must end with the agent type that did the work:
- Bug fixes: `-- Comment by bug fix agent`
- New features: `-- Comment by implementation agent`
- Triage/close only (no code change): `-- Comment by coding agent`

**Why:** User wants to track which agent type handled each issue. Generic "coding agent" doesn't distinguish between bug fixes and implementations.

**How to apply:** When constructing the GitHub comment body, use the correct signature based on whether code was changed (bug fix or implementation) vs just triaged/closed.
