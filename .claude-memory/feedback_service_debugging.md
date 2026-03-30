---
name: Service debugging checklist
description: When a module shows as down, check these things in order before attempting fixes
type: feedback
---

When a service shows "Down" or "502", follow this checklist:

1. **Check PM2 status** — is it `online`, `errored`, or `stopped`?
2. **Check PM2 error logs** — `pm2 logs <name> --lines 30 --nostream` — look for the actual crash reason
3. **Check if port is listening** — `ss -tlnp | grep <port>` — process can show "online" in PM2 but not bind the port
4. **Check nginx config** — `cat /etc/nginx/sites-enabled/<domain>.conf` — verify server_name matches the URL being tested and proxy_pass points to correct port
5. **Test locally first** — `curl http://localhost:<port>/health` — isolates whether it's an app issue or nginx issue

**Why:** We wasted time assuming services were truly down when the root cause was often: wrong PM2 entry point (Monitor used `index.js` instead of `adminApi.js`), nginx pointing to wrong URL (testbilling vs test-billing), or process online but port not bound (billing showed online but 4001 wasn't listening).

**How to apply:** Always diagnose before restarting. `pm2 delete + fresh start` is the fix only AFTER confirming the entry point and config are correct.
