---
name: Deploy must purge server cache
description: Every deployment to the test server must purge PM2 cache and tsx cache to avoid stale code
type: feedback
---

Every deployment to the test server MUST purge caches before restarting. PM2 and tsx cache old compiled code, so `pm2 restart` alone does NOT pick up changes.

**Why:** PM2 + tsx caches compiled TypeScript. Without purging, the server continues running old code even after `git pull`. This caused multiple incidents where deployed fixes appeared to not work.

**How to apply:** On every deploy, always run this sequence:
1. `git pull origin main`
2. `cd packages/shared && rm -rf dist tsconfig.tsbuildinfo && npx tsc --outDir dist --rootDir src --declaration --esModuleInterop --module nodenext --target ES2022 --moduleResolution node16 --skipLibCheck`
3. `pm2 delete empcloud && rm -rf node_modules/.cache /tmp/tsx-*`
4. `cd packages/server && pm2 start "npx tsx src/index.ts" --name empcloud`
5. Verify: `curl https://test-empcloud-api.empcloud.com/health` returns 200

Never use `pm2 restart` — always `pm2 delete` + fresh `pm2 start`.
