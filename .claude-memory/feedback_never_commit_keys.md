---
name: NEVER commit API keys or secrets to code/git
description: Critical rule — API keys must ONLY be set via server .env or UI config, NEVER in scripts or code files
type: feedback
---

NEVER commit API keys, passwords, or secrets to any file that gets pushed to GitHub.

**Why:** On 2026-03-27, the Anthropic API key was accidentally committed in scripts/config_ai.cjs, pushed to a public GitHub repo, detected by GitHub secret scanning, and Anthropic permanently deactivated the key.

**How to apply:**
- API keys go ONLY in server .env files (via SSH) or the Super Admin AI Config UI (/admin/ai-config)
- NEVER create script files with hardcoded keys
- NEVER use API keys in test files
- Before every commit, mentally check: does this diff contain any secrets?
- If you need to configure something with a key, use SSH to edit .env directly on the server
