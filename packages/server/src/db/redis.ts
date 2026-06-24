// =============================================================================
// EMP CLOUD — Shared Redis client factory (socket.io adapter / pub-sub)
// =============================================================================
//
// Used by the chat realtime layer's socket.io Redis adapter so that, in a
// multi-instance (PM2 cluster) deployment, an event emitted on one worker fans
// out to sockets connected to other workers. In single-instance dev/prod this
// module is never touched (the in-memory adapter is correct on its own).
//
// IMPORTANT: adapter/blocking clients must use maxRetriesPerRequest: null — the
// subscriber connection blocks, and the common cache-client setting of
// maxRetriesPerRequest: 1 would break it.

import Redis from "ioredis";
import { config } from "../config/index.js";

export interface AdapterRedisPair {
  pub: Redis;
  sub: Redis;
}

/**
 * Build a publisher + duplicated subscriber for the socket.io Redis adapter.
 * Lazy-connect so callers control when the connection is attempted (and can
 * handle failure without crashing boot).
 */
export function makeAdapterRedis(): AdapterRedisPair {
  const pub = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  const sub = pub.duplicate();
  return { pub, sub };
}
