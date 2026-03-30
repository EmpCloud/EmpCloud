---
name: GitHub Deploy Keys (NOT server SSH keys)
description: GitHub-only deploy keys for pushing/pulling repos. These do NOT provide SSH access to the test server (163.227.174.141).
type: reference
---

**IMPORTANT:** All keys in ~/.ssh/ are GitHub deploy keys for repo access only. There is NO SSH key for the test server (163.227.174.141). Server deployments require the user to pull manually or Suresh to set up server SSH access.

## SSH Config (~/.ssh/config)

| Host Alias | Repo | Key File |
|------------|------|----------|
| github-empcloud | EmpCloud/EmpCloud | ~/.ssh/github-deploy-empcloud |
| github-payroll | EmpCloud/emp-payroll | ~/.ssh/github-deploy |
| github-billing | EmpCloud/emp-billing | ~/.ssh/github-deploy-billing |
| github-recruit | EmpCloud/emp-recruit | ~/.ssh/github-deploy-recruit |
| github-performance | EmpCloud/emp-performance | ~/.ssh/github-deploy-performance |
| github-rewards | EmpCloud/emp-rewards | ~/.ssh/github-deploy-rewards |
| github-exit | EmpCloud/emp-exit | ~/.ssh/github-deploy-exit |
| github-lms | EmpCloud/emp-lms | ~/.ssh/github-deploy-lms |
| github-project | EmpCloud/emp-project | ~/.ssh/github-deploy-project |
| github-monitor | EmpCloud/emp-monitor | ~/.ssh/github-deploy-monitor |

## Git Remote URLs (SSH format)
Each repo uses `git@<host-alias>:EmpCloud/<repo>.git` as the remote URL.
Example: `git remote set-url origin git@github-monitor:EmpCloud/emp-monitor.git`

## Adding a New Deploy Key
1. Generate: `ssh-keygen -t ed25519 -f ~/.ssh/github-deploy-<name> -N "" -C "deploy-<name>"`
2. Add to SSH config (Host alias pointing to github.com with the key)
3. Add public key to GitHub: repo Settings → Deploy keys → Add (with write access)
4. Set remote: `git remote set-url origin git@github-<name>:EmpCloud/<repo>.git`

## Note
The GitHub token `ghp_2Qyj...` (in emp-billing .env) has read-only access to most repos. It can NOT add deploy keys to repos it doesn't admin. Deploy keys must be added manually via GitHub UI by someone with admin access (sumitempcloud).

**How to apply:** When pushing to a new repo for the first time, check if a deploy key exists. If not, generate one and ask the user to add it to GitHub.
