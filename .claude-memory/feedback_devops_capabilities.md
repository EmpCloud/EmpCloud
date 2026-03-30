---
name: We have full devops access — server creds, sudo, nginx, DB
description: RULE — We can and should do all devops ourselves: nginx config, DB creation, PM2, env vars. No need to ask Suresh.
type: feedback
---

We have FULL devops access to the test server:

1. **SSH**: paramiko with password (empcloud-development user)
2. **sudo**: password-based sudo works (`echo $PW | sudo -S ...`)
3. **nginx**: can read/write /etc/nginx/sites-available/, test, and reload
4. **MySQL**: can create databases, tables, run migrations (empcloud user)
5. **PM2**: full control over all processes
6. **Redis**: configured with password
7. **Git**: can clone, pull, push on the server

**Why:** We wasted time waiting for "Suresh to update nginx" when we could do it ourselves. Always do devops directly.

**How to apply:** When deploying a new module:
1. Create MySQL database
2. Clone repo on server
3. Install deps, build shared, create .env
4. Run migrations
5. Start PM2 process
6. Update nginx config with sudo
7. Test nginx (`sudo nginx -t`), reload (`sudo nginx -s reload`)
8. Verify via public URL
9. Run Playwright tests

**Important nginx note:** When writing nginx config via Python, `$http_upgrade`, `$host`, etc. get stripped. Use SFTP to write the file or `sed` to fix the `$` variables after writing.
