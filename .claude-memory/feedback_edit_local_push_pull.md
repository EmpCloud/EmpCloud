---
name: Edit locally, push to GitHub, pull on server
description: Never edit code directly on server — always edit local, push to GitHub, pull on server so all three stay in sync
type: feedback
---

Never edit code directly on the server. The correct workflow is:

1. Edit code locally (in the local repo)
2. Commit and push to GitHub
3. Pull on the server to deploy

**Why:** Editing on the server causes local, GitHub, and server to diverge. The user wants all three to always have the same files.

**How to apply:** All code changes go through the local repo. SSH into the server ONLY for: pulling updates, restarting PM2, running curl tests, checking logs. Never use SSH to edit source files.
