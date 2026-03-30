---
name: PM2 Ecosystem Config & Port Mapping
description: Complete port mapping for all 12 EMP services, nginx→PM2 config, and deploy instructions
type: reference
---

## PM2 Ecosystem Config

File location on server: `/home/empcloud-development/ecosystem.config.js`

### Usage
```bash
# Start all services
pm2 start /home/empcloud-development/ecosystem.config.js

# Restart a specific service (purge cache first!)
pm2 delete empcloud-server && rm -rf ~/.cache/tsx && pm2 start /home/empcloud-development/ecosystem.config.js --only empcloud-server

# Save PM2 state (persist across reboots)
pm2 save
```

## Complete Port Mapping (from nginx)

| Service | PM2 Name | Port | CWD | Start Command |
|---------|----------|------|-----|---------------|
| EMP Cloud Core | empcloud-server | 3000 | empcloud/packages/server | npx tsx src/index.ts |
| EMP Payroll | emp-payroll | 4000 | emp-payroll/packages/server | npx tsx src/index.ts |
| EMP Billing | emp-billing | 4001 | emp-billing/packages/server | npx tsx src/index.ts |
| EMP Performance | emp-performance | 4300 | emp-performance/packages/server | npx tsx src/index.ts |
| EMP Exit | emp-exit | 4400 | emp-exit/packages/server | npx tsx src/index.ts |
| EMP Recruit | emp-recruit | 4500 | emp-recruit/packages/server | npx tsx src/index.ts |
| EMP Rewards | emp-rewards | 4600 | emp-rewards/packages/server | npx tsx src/index.ts |
| EMP LMS | emp-lms | 4700 | emp-lms/packages/server | npx tsx src/index.ts |
| EMP Monitor | emp-monitor | 5000 | emp-monitor/packages/server | node src/adminApi.js |
| Project API | emp-project-api | 9000 | emp-project/packages/server/project | node project.server.js |
| Project Task API | emp-project-task-api | 9001 | emp-project/packages/server/task | node task.server.js |
| Project Client | emp-project-client | 3100 | emp-project/packages/client | npx next dev -p 3100 |

## Deploy Procedure (ALWAYS follow this)
1. `git pull origin main` on server
2. For shared packages: `pnpm build` in packages/shared
3. `pm2 delete <service-name>`
4. `rm -rf ~/.cache/tsx` (critical for tsx services)
5. `pm2 start /home/empcloud-development/ecosystem.config.js --only <service-name>`
6. `pm2 save`

## Why errors kept happening
- No ecosystem config → ad-hoc pm2 start commands used wrong ports
- Project client started on 3001 but nginx expects 3100
- tsx cache not purged → old code runs despite git pull
- shared package not rebuilt → new exports not available
