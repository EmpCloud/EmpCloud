---
name: Agents must update MD files after every fix/implementation
description: Bug fix agents update BUGFIX_AGENTS.md, implementation agents update IMPLEMENTATIONS.md after completing work
type: feedback
---

Every agent must update its knowledge base after completing work. This enables continuous learning.

**Why:** Without updating, agents keep making the same mistakes and rebuilding things that already exist. The MD files are the shared memory across conversations.

**How to apply:**
1. Bug fix agents: After fixing a bug, add the learning to BUGFIX_AGENTS.md (new pattern, gotcha, or validation rule discovered)
2. Implementation agents: After building a feature, add it to IMPLEMENTATIONS.md log (date, commit, feature, status, issues)
3. Main context: After deploying, update both files with any new learnings from the session
4. Always check both files BEFORE starting work to avoid duplicate effort
