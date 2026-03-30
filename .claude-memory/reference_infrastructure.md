---
name: Complete infrastructure reference — server, ports, URLs, deploy
description: All-in-one reference for test server, PM2 ecosystem, nginx ports, GitHub Actions, deploy procedure
type: reference
---

## Test Server
- **IP:** 163.227.174.141
- **User:** empcloud-development
- **Auth:** paramiko + password (no SSH keys)
- **Ecosystem config:** `/home/empcloud-development/ecosystem.config.js`

## PM2 Services & Ports

| Service | PM2 Name | Port | CWD | Start |
|---------|----------|------|-----|-------|
| EMP Cloud | empcloud-server | 3000 | empcloud/packages/server | npx tsx src/index.ts |
| Payroll | emp-payroll | 4000 | emp-payroll/packages/server | npx tsx src/index.ts |
| Billing | emp-billing | 4001 | emp-billing/packages/server | npx tsx src/index.ts |
| Performance | emp-performance | 4300 | emp-performance/packages/server | npx tsx src/index.ts |
| Exit | emp-exit | 4400 | emp-exit/packages/server | npx tsx src/index.ts |
| Recruit | emp-recruit | 4500 | emp-recruit/packages/server | npx tsx src/index.ts |
| Rewards | emp-rewards | 4600 | emp-rewards/packages/server | npx tsx src/index.ts |
| LMS | emp-lms | 4700 | emp-lms/packages/server | npx tsx src/index.ts |
| Monitor Admin | emp-monitor | 5000 | empmonitor/Backend/admin | node adminApi.js |
| Monitor Desktop | emp-monitor-desktop | 5002 | empmonitor/Backend/desktop | node desktopApi.js |
| Monitor Realtime | emp-monitor-realtime | 5001 | empmonitor/Backend/realtime | node server.js |
| Monitor Store Logs | emp-monitor-store-logs | 5003 | empmonitor/Backend/store-logs-api | npx tsx src/main.ts |
| Monitor Productivity | emp-monitor-productivity | 5004 | empmonitor/Backend/productivity_report | node productivity_report_api.js |
| Monitor WebSocket | emp-monitor-websocket | 5005 | empmonitor/Backend/web-socket-server | node server.js |
| Monitor Cron | emp-monitor-cronjobs | 5006 | empmonitor/Backend/cronjobs | node cronService.js |
| Monitor Remote | emp-monitor-remote | 5007 | empmonitor/Backend/remote_socket | node server.js |
| Project API | emp-project-api | 9000 | emp-project/packages/server/project | node project.server.js |
| Project Tasks | emp-project-task-api | 9001 | emp-project/packages/server/task | node task.server.js |
| Project Client | emp-project-client | 3100 | emp-project/packages/client | npx next dev -p 3100 |

## Public URLs

| Module | Frontend | API |
|--------|----------|-----|
| Cloud | test-empcloud.empcloud.com | test-empcloud-api.empcloud.com |
| Payroll | testpayroll.empcloud.com | testpayroll-api.empcloud.com |
| Billing | test-billing.empcloud.com | test-billing-api.empcloud.com |
| Performance | test-performance.empcloud.com | test-performance-api.empcloud.com |
| Exit | test-exit.empcloud.com | test-exit-api.empcloud.com |
| Recruit | test-recruit.empcloud.com | test-recruit-api.empcloud.com |
| Rewards | test-rewards.empcloud.com | test-rewards-api.empcloud.com |
| LMS | testlms.empcloud.com | testlms-api.empcloud.com |
| Monitor | test-empmonitor.empcloud.com | test-empmonitor-api.empcloud.com |
| Projects | test-project.empcloud.com | test-project-api.empcloud.com |

## Deploy Procedure
```
1. git pull origin main
2. cd packages/shared && pnpm build  (if shared changed)
3. cd ../client && npm run build     (if frontend changed)
4. pm2 delete <name>
5. rm -rf ~/.cache/tsx
6. pm2 start /home/empcloud-development/ecosystem.config.js --only <name>
7. pm2 save
8. curl http://localhost:<port>/health
```

## GitHub Actions
- **EmpCloud/EmpCloud** has auto-deploy on push to main
- Secrets: DEPLOY_HOST, DEPLOY_USER, DEPLOY_PASSWORD (configured)
- Other repos: manual deploy only

## Login Credentials (test)
- Super admin: admin@empcloud.com / <see .env>
- Org admin: ananya@technova.in / <see .env>
- Employee: arjun@technova.in / <see .env>
