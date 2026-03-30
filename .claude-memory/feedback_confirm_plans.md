---
name: Always confirm plans before starting to build
description: Never start building features from a plan without explicit user confirmation. Present the plan, wait for approval, then build.
type: feedback
---

When presenting a plan (features to build, implementation approach, etc.), ALWAYS wait for explicit user confirmation before starting to code.

**Why:** The user wants to review and potentially modify plans before work begins. They may want to iterate on the plan, add/remove features, or change priorities. Starting without confirmation wastes effort on unwanted work.

**How to apply:**
1. Present the plan clearly (what features, what they do)
2. Ask "Want me to go ahead?" or similar
3. WAIT for the user to say yes/approve
4. Only then start building
5. This applies to: feature lists, implementation plans, architecture decisions, any non-trivial work

This is different from the "always show before building" feedback — that's about showing code/READMEs. This is specifically about PLANS and FEATURE LISTS. Don't just list features and immediately start spinning up agents.
