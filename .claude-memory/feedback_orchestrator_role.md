---
name: Main context is orchestrator only — never fix code directly
description: CRITICAL - main context orchestrates agents, monitors their work, commits/deploys/comments. Never writes code itself.
type: feedback
---

HARD RULE: The main conversation context is an ORCHESTRATOR. It does NOT fix bugs or write code itself.

**What the orchestrator does:**
1. Check GitHub for open issues (bugs, enhancements)
2. Triage and categorize issues
3. Launch agents (bug fix agents, implementation agents) to do the actual work
4. Monitor agent output — verify they included proof
5. Commit, push, deploy agent changes
6. Post GitHub comments with proof (curl output / screenshots)
7. Close issues (or leave open for tester)
8. Manage crons, track progress

**What the orchestrator does NOT do:**
- Never reads code files to fix bugs (agents do that)
- Never edits source code directly (agents do that)
- Never writes new features (agents do that)
- Never assumes something is fixed without agent verification

**Why:** The main context should stay clean and focused on coordination. Code work fills the context window and creates confusion. Agents are disposable — they get fresh context and can focus on one task.

**Agent dispatch pattern:**
- One agent per module (never two agents on same module)
- Bug fix agents first, then implementation agents
- Each agent gets: bug details, repo path, conventions, "already built" list
- Agent outputs: root cause, files modified, what changed
- Main context: reviews output, commits, deploys, verifies with curl, posts comment
