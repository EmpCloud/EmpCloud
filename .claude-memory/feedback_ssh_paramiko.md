---
name: Server SSH access method — paramiko with password
description: ALWAYS use Python paramiko with password auth to SSH into test server. No SSH keys exist for the server. Credentials in reference_production_server.md.
type: feedback
---

ALWAYS use Python `paramiko` with **password authentication** to SSH into the test server (163.227.174.141). There are NO SSH keys for the server — all keys in ~/.ssh/ are GitHub deploy keys only.

**Credentials:** Stored in `reference_production_server.md` — user: `empcloud-development`, password there.

**Why:** Windows Git Bash doesn't support interactive password SSH. sshpass is unavailable. SSH key-based access was never set up for this server.

**How to apply:**
- Always use `python -c "import paramiko..."` or `python << 'PYEOF'` heredoc pattern
- Connect with: `ssh.connect('163.227.174.141', username='empcloud-development', password=PASSWORD)`
- Use `sftp.put()` for file uploads
- Use `sys.stdout.buffer.write()` for UTF-8 safe output
- For sudo: `echo 'password' | sudo -S`
- NEVER use `ssh -i` — no server SSH key exists
- NEVER commit server credentials to any repo
