---
name: Module PM2 entry points and paths
description: Correct PM2 start commands and entry points for each module — prevents wrong-path crashes
type: reference
---

## PM2 Entry Points (verified 2026-03-29)

| Module | Repo Path on Server | Entry Point | PM2 Start Command |
|--------|-------------------|-------------|-------------------|
| empcloud | empcloud-projects/empcloud/packages/server | src/index.ts | `pm2 start "npx tsx src/index.ts" --name empcloud` |
| emp-billing | empcloud-projects/emp-billing/packages/server | src/index.ts | `pm2 start "npx tsx src/index.ts" --name emp-billing` |
| emp-monitor | empcloud-projects/empmonitor/Backend/admin | adminApi.js | `pm2 start adminApi.js --name emp-monitor` |
| emp-payroll | empcloud-projects/emp-payroll/packages/server | src/index.ts | `pm2 start "npx tsx src/index.ts" --name emp-payroll` |
| emp-performance | empcloud-projects/emp-performance/packages/server | src/index.ts | `pm2 start "npx tsx src/index.ts" --name emp-performance` |
| emp-recruit | empcloud-projects/emp-recruit/packages/server | src/index.ts | `pm2 start "npx tsx src/index.ts" --name emp-recruit` |
| emp-rewards | empcloud-projects/emp-rewards/packages/server | src/index.ts | `pm2 start "npx tsx src/index.ts" --name emp-rewards` |
| emp-exit | empcloud-projects/emp-exit/packages/server | src/index.ts | `pm2 start "npx tsx src/index.ts" --name emp-exit` |
| emp-lms | empcloud-projects/emp-lms/packages/server | src/index.ts | `pm2 start "npx tsx src/index.ts" --name emp-lms` |
| emp-project-api | empcloud-projects/emp-project/packages/server | src/index.ts | `pm2 start "npx tsx src/index.ts" --name emp-project-api` |

## Key Gotchas
- **emp-monitor** uses plain Node.js (adminApi.js), NOT tsx — it's a legacy CJS app
- **emp-monitor** repo folder is `empmonitor` (no hyphen), all others use hyphen (`emp-payroll`, etc.)
- **emp-billing** is internal only — no public frontend, API-only. The `client/dist/index.html` ENOENT errors are harmless.
- Always `pm2 delete` + `rm -rf node_modules/.cache` before fresh start (never `pm2 restart`)
