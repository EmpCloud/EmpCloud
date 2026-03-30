---
name: Always test deployed URLs not localhost
description: When verifying work on the server, test via public HTTPS URLs (test-*.empcloud.com), never localhost
type: feedback
---

When verifying deployed work, always test via the public HTTPS URLs (e.g., `https://test-rewards.empcloud.com`), NOT `http://localhost:PORT`. The user only cares about what works from a browser perspective.

**Why:** localhost tests bypass nginx, SSL, and CORS — they don't reflect real user experience. A service can work on localhost but fail via the public URL due to nginx misconfiguration or CORS issues.

**How to apply:** All curl tests during verification should use the deployed subdomain URLs. Only use localhost for debugging if the public URL fails.
