// =============================================================================
// EMP CLOUD — Route auto-discovery for the OpenAPI / Swagger docs
//
// Express 5 stores mount paths inside compiled path-to-regexp matchers, so the
// usual router-stack walk (and express-list-endpoints) can't recover full URLs.
// Instead we intercept `app.use(prefix, router)` to capture each mount prefix,
// then walk the mounted router's stack for its route layers. This covers the
// standard `app.use('/api/v1/x', xRoutes)` mounting pattern used across the EMP
// services, so dropping recordMounts(app) into any of them yields a complete
// endpoint list for Swagger with zero per-route annotation.
// =============================================================================
import type { Express } from "express";

type Mount = { prefix: string; router: any };
const mounts: Mount[] = [];

/**
 * Wrap app.use so router mounts (a string prefix followed by an Express Router)
 * are recorded. Call this immediately after `const app = express()`, before any
 * routes are mounted.
 */
export function recordMounts(app: Express): void {
  const orig = app.use.bind(app);
  (app as any).use = function (...args: any[]) {
    if (typeof args[0] === "string" && args.length >= 2) {
      const handler = args[args.length - 1];
      // A mounted Router exposes a `.stack` array; plain middleware doesn't.
      if (handler && Array.isArray(handler.stack)) {
        mounts.push({ prefix: args[0], router: handler });
      }
    }
    return orig(...args);
  };
}

/**
 * Discovered { path, methods } for every mounted route. Express `:param` is
 * normalised to OpenAPI `{param}`. Safe to call repeatedly (cheap walk).
 */
export function discoveredPaths(): { path: string; methods: string[] }[] {
  const out: { path: string; methods: string[] }[] = [];
  for (const { prefix, router } of mounts) {
    for (const layer of router.stack || []) {
      const route = (layer as any).route;
      if (!route) continue;
      const rel: string = route.path || "";
      let full = `${prefix}${rel}`;
      if (full.length > 1) full = full.replace(/\/+$/, "");
      const oapi = full.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
      const methods = Object.keys(route.methods || {})
        .filter((m) => m !== "_all")
        .map((m) => m.toLowerCase());
      if (methods.length) out.push({ path: oapi, methods });
    }
  }
  return out;
}
