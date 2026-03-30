---
name: Always add screenshots to README before pushing
description: After taking feature screenshots, always add them as markdown image references in the README.md before committing to remote
type: feedback
---

Always add screenshots to the README.md with markdown image references before pushing to remote.

**Why:** Screenshots committed to the repo but not referenced in the README are invisible to the team. The README is what people see on GitHub.

**How to apply:**
- After taking Playwright screenshots, add a "## Screenshots" section to the README
- Use markdown image syntax: `![Feature Name](path/to/screenshot.png)`
- Add this section before "Tech Stack" or "Project Structure" (after Features table)
- Commit the README update together with the screenshots
- Verify on GitHub that images render correctly
