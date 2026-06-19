# EmpCloud Chat — Realtime (socket.io) + Delivery/Read Ticks: Final Architecture

**Status:** Build-ready (design) · **Date:** 2026-06-17 · **Branch:** `feat/employee-chat`
**Next migration number:** `074` (072/073 exist)
**Scope:** WebSocket realtime transport + delivery/read ticks (single ✓ / double ✓✓ / blue ✓✓).
Typing, presence, and reactions are explicit non-goals (future work).

---

## 1. Executive summary

We add a WebSocket (socket.io) realtime layer and WhatsApp-style delivery/read ticks to EmpCloud
chat, attached to the **existing `http.Server`** with JWT-handshake auth that reuses
`verifyAccessToken` plus the token-revocation check.

**Correctness lives in the database, not the socket.** Unread badges stay driven by the untouched
`conversation_participants.last_read_message_id` high-water mark. Ticks derive from a new additive
`last_delivered_message_id` marker (fast path) plus a lazily-written `chat_message_receipts` ledger
(for the group per-name breakdown). Every realtime write has a REST equivalent. The socket is a pure
**accelerator** over an authoritative REST snapshot resynced via `since-message-id`, so a dead socket
degrades to today's polling chat and **never loses a message**.

The Redis adapter is wired but **flag-gated**: dev runs single-instance without it; prod enables it
only once PM2 cluster mode is confirmed.

---

## 2. Transport architecture

### 2.1 Attach point (`packages/server/src/index.ts`)
`app.listen()` returns the real Node `http.Server` (captured as `const server`). No
`http.createServer` refactor needed. Attach socket.io right after `app.listen(...)`:
```ts
const io = attachChatRealtime(server); // from ./realtime/io.ts
```
**Graceful shutdown:** call `await io.close()` *before* `server.close()`, else open sockets stall the
close until the 10s force-exit.

### 2.2 New module `packages/server/src/realtime/io.ts`
Exports `attachChatRealtime(server)` and `getIO()`. Uses a dedicated **`/chat` namespace** (leaves
room for future `presence`/`typing` namespaces). CORS mirrors the Express config.

### 2.3 JWT handshake auth
Mirror the Express auth middleware exactly: `verifyAccessToken(token)` **plus** the
`oauth_access_tokens` jti/`revoked_at` lookup (verify alone doesn't check revocation). Token from
`socket.handshake.auth.token`. `socket.data.user.sub` = numeric userId, `org_id` = numeric org.
**Token expiry mid-session:** per-socket timer to `decoded.exp` → emit `TOKEN_EXPIRED` + disconnect;
client refreshes and reconnects. Forced logout/revocation → `session:revoked` + `disconnectSockets`.

### 2.4 Rate limiting
WS bypasses Express limiters. Add a per-user concurrent-socket cap (~10) and a token-bucket throttle
on inbound `delivered`/`read` acks (each hits the DB).

### 2.5 Room model (org-namespaced so cross-tenant emits are impossible)
| Room | Joined | Purpose |
|---|---|---|
| `u:{org}:{userId}` | every socket on connect | fan out to all of a user's tabs: `message:new` to recipients, **tick updates to the sender**, `conversation:bump`, `session:revoked` |
| `c:{conversationId}` | lazily on `conversation:open` after `requireParticipant` | `message:new` to open viewers + tick broadcasts for the open thread |

Membership is **re-derived from scratch on every (re)connect** (self-heals after membership changes).
`org_id` always comes from `socket.data.user`, never the client.

### 2.6 Redis adapter — "dev works without Redis, prod needs the adapter"
Single-instance (dev `tsx watch`, prod PM2 **fork**) is fully correct with the in-memory adapter.
The Redis adapter is needed **only** for PM2 **cluster** mode (cross-instance fan-out). New shared
module `packages/server/src/db/redis.ts` with `maxRetriesPerRequest: null` + `lazyConnect`. Gated
behind `CHAT_WS_REDIS_ADAPTER=true` (default off). On Redis-down: log error + raise a **degraded
health flag** (don't silently swallow); REST polling remains the backstop.
> **Ops prereq:** Nginx must proxy `Upgrade`/`Connection` on `/socket.io/`. In cluster mode,
> **sticky sessions are mandatory** for the handshake. Misconfig silently falls back to long-polling.

---

## 3. Tick state model (migration 074)

### 3.1 Principle
`conversation_participants.last_read_message_id` stays the **sole** source of truth for unread
counts/badges — the four dependent paths (`listConversations`, `getTotalUnread`, `markRead` guard,
`sendMessage` self-read) are **untouched**. Tick storage is purely additive.

Two layers: a cheap **per-participant high-water marker** drives the aggregate single/double/blue for
1:1 and group (O(participants)); a **per-(message,recipient) ledger** is written lazily and read only
for the on-demand group "read by / delivered to" panel.

### 3.2 Migration `074_chat_delivery_ticks.ts` (guarded + reversible, like 073)
```ts
// Layer 1 — delivered high-water marker (mirror of the read marker)
alterTable("conversation_participants"):
  + last_delivered_message_id  bigint unsigned null
  + last_delivered_at          timestamp null

// Layer 2 — per-recipient ledger (groups + per-name panel)
createTable("chat_message_receipts"):
  id, message_id FK→chat_messages CASCADE, conversation_id FK→conversations CASCADE,
  recipient_id (never the sender), delivered_at null, read_at null, created_at
  UNIQUE(message_id, recipient_id)   // idempotency key — heart of correctness
  INDEX(conversation_id, message_id), INDEX(recipient_id, message_id)
```

### 3.3 Markers monotonic; ledger lazy + idempotent
- `markDelivered(...)` mirrors `markRead`'s forward-only guard.
- Ledger rows born only when a real per-message delivered/read event names them. UPSERT with
  `COALESCE(delivered_at, now)` / `COALESCE(read_at, now)` so duplicate/late/out-of-order events
  never regress. **Read implies delivered.**
- **No range-UPSERT on read** (a weekend's group backlog would write thousands of rows in the read
  hot path). Aggregate tick is computed from the MIN over markers; ledger is per-ack only.

### 3.4 Self-consistency on send (transaction fix — required)
`sendMessage` currently has three un-transacted bare awaits. Wrap message-insert + marker updates in
a transaction; set the sender's `last_delivered_message_id` alongside the existing self-read. Emit
**after commit**.

### 3.5 Tick computation (sender's view only; `is_mine`)
Recipients = **active** participants (`is_active=true`) excluding the sender. Soft-deleted messages
render no ticks.
- **DIRECT:** `read` if other's `last_read ≥ M.id`; else `delivered` if other's `last_delivered ≥ M.id`; else `sent`.
- **GROUP:** blue **read** ⇔ every active recipient read; grey double **delivered** ⇔ every active
  recipient delivered (not all read); else single **sent**.
  **Empty-denominator guard:** zero active recipients ⇒ `sent`, never auto-blue.
- Surfaced as `tick_status: "sent"|"delivered"|"read"`, computed **server-side only** for `is_mine`.

---

## 5. Event protocol (`/chat` namespace; message id is the cursor/idempotency key)

### Server → client
| Event | Room | Payload |
|---|---|---|
| `message:new` | `c:{convId}` + `u:{org}:{recipientId}` | `{ message, conversation_id }`, sender echo carries `tick_status:"sent"` + `client_msg_id` |
| `conversation:bump` | `u:{org}:{recipientId}` | `{ conversation_id, last_message_at }` → triggers `invalidate(["chat-conversations"])` only (no client unread delta) |
| `message:tick` | `u:{org}:{senderId}` (+ `c:{convId}`) | `{ conversation_id, up_to_message_id, recipient_id, tick_status, agg:{delivered_count,read_count,total_recipients} }` — applies across the whole id range |
| `session:revoked` | `u:{org}:{userId}` | `{}` |
| `error` | socket | `{ code, event? }` |

### Client → server (ack-based)
| Event | Server action |
|---|---|
| `conversation:open` | `requireParticipant`, join `c:{id}`, markDelivered to latest, emit tick |
| `conversation:close` | leave `c:{id}` |
| `message:delivered` | auto-emitted on receiving `message:new` for **any** conversation → markDelivered + ledger UPSERT → emit tick (double tick when connected but thread closed) |
| `message:read` | calls existing `markRead` + bump delivered + ledger `read_at` → emit tick |
| `tick:resync` | on reconnect/open; **`since_message_id` = lowest visible id, not highest** (tick state changes on old messages) |

**Idempotency:** markers monotonic; ledger UPSERTs idempotent. **`message:tick` must emit even on
no-op acks** (else a reconnected sender never gets the blue tick by socket).

### REST fallback (authoritative; socket is the accelerator)
- **Sending stays REST** (`POST .../messages`, `.../attachment`) — socket only pushes the persisted result.
- `POST .../read` (existing) extended to be delivery-aware + stamp ledger (contract unchanged).
- `POST .../delivered` (new), `GET .../ticks?since_message_id=N` (new), `GET .../messages/:id/receipts` (new).
- `listMessages` extended to return `tick_status` so cold load / poll renders correct ticks with no socket.

### Emission integration
Service layer emits **after commit** via `chat-events.ts` (`setChatEmitter`/`emitMessageNew`/
`emitTick`/`emitBump`). No emitter set (tests/disabled) ⇒ no-op, REST/polling still works.

---

## 6. Reconnection & resilience
- socket.io-client default backoff; **function-form auth** re-reads the freshest token on reconnect.
- **Replay = REST resync, not socket buffering.** On connect: invalidate `["chat-conversations"]` +
  active `["chat-messages",convId]`, emit `tick:resync { since = lowest visible id }`.
- **Polling stays on** (conversations 5s, messages 3s). Dead socket = exactly today's chat. (Do **not**
  relax intervals in initial rollout.)
- **Poll-vs-socket reconciliation:** `listMessages` is the single hydration source for `tick_status`
  (same value the socket sends), so a poll landing after a socket patch yields the same value — no
  flicker. Optimistic rows merged by `client_msg_id`.
- **Token-expiry recovery:** `connect_error TOKEN_EXPIRED` → axios refresh → reconnect.
- **Failed-send state machine:** `sending`(clock) → `sent`(✓) → `delivered`(✓✓ grey) → `read`(✓✓ blue);
  `sending` → `failed`(red ! + retry). delivered/read only advance.

---

## 7. Client design
- **Global `SocketProvider`** wraps `DashboardLayout` in `App.tsx` (survives route/conversation
  changes; not in `main.tsx`/pages). No-ops until authed; teardown on logout/`TOKEN_EXPIRED`/
  `session:revoked` — **not** on routine token refresh.
- **React-query integration:** `message:new` → cache append (dedupe by id + `client_msg_id`) +
  invalidate conversations + auto-emit `message:delivered`. `message:tick` → patch `tick_status`
  across the id range. reconnect → invalidate + `tick:resync`.
- **Read emission is focus/visibility-gated** (`visibilityState==="visible"` + IntersectionObserver on
  the last bubble) — fixes "blue tick is a lie." Falls back to `POST .../read` when socket is down.
- **Ticks render** in the existing metadata span, gated on `is_mine`: clock/✓/✓✓grey/✓✓blue/red!. Group
  tap → lazy "Read by / Delivered to / Pending" sheet via `GET .../receipts`.
- **Optimistic send:** temp row (negative id, `client_msg_id`, `sending`) → replaced by POST result.

---

## 8. Phased build plan (each phase independently shippable)
- **P0 — Schema.** Migration 074 (additive, guarded/reversible) + shared types (`ChatMessageReceipt`,
  `tick_status`, `client_msg_id`). *Verify:* unread queries/badge byte-for-byte unchanged.
- **P1 — Server data layer + REST (correct ticks over pure polling, no transport).** Transaction in
  `sendMessage`; `markDelivered`; delivery-aware `markRead`; tick computation; `listMessages` returns
  `tick_status`; REST `delivered`/`ticks`/`receipts`; thread `client_msg_id`. *Verify:* ticks correct
  via REST+polling with **zero WebSocket code**; member-removal flips group aggregates; unread unchanged.
- **P2 — Shared Redis module** (`db/redis.ts`, behind flag, default off).
- **P3 — Server socket.io gateway + `message:new` realtime.** Install socket.io + redis-adapter;
  attach after `app.listen`; handshake auth (JWT + revocation + expiry timer); rooms; throttle;
  `io.close()` in shutdown; emit `message:new`/`conversation:bump` after commit.
- **P4 — Server ack handlers + delivered ticks** (`conversation:open/close`, `message:delivered`,
  `message:read`, `tick:resync`; emit `message:tick` incl. on no-op acks).
- **P5 — Client SocketProvider (behind `VITE_CHAT_WS`) + `message:new` augmenting polling.** Keep all
  polling. *Verify:* flag off = today's chat byte-for-byte; flag on = instant messages, no dup bubbles.
- **P6 — Client read acks + tick rendering + group breakdown.** Visibility-gated read emit; optimistic
  state machine; glyphs gated on `is_mine`; lazy receipt panel.
- **P7 — Ops/rollout.** Nginx Upgrade headers; confirm PM2 cluster-vs-fork + sticky sessions; enable
  `CHAT_WS_REDIS_ADAPTER`; enable `VITE_CHAT_WS` gradually. (Relax polling to 30s only later, after
  cluster + Redis fan-out verified in prod.)

**Rollback at any phase:** flip `VITE_CHAT_WS` off (instant revert to pure polling) and/or stop
initializing the gateway. The 074 columns/table are harmless if left, or reversible. No backfill.

---

## 9. Risks & non-goals (summary)
Key risks (all mitigated in the plan): PM2 mode unverifiable from repo (polling backstops; degraded
flag); sticky sessions in cluster mode; blue-tick honesty (visibility gate, P6); poll clobbering socket
patches (single hydration source); resync cursor must be **lowest** visible id; ledger growth (lazy +
aggregate-from-markers + retention); token expiry mid-socket; forced logout needs adapter; tick on
no-op ack; WS bypasses limiters; empty-recipient group ⇒ `sent`; bump carries no unread delta.

**Non-goals (future):** typing indicators, presence/online, reactions, push/offline store-and-forward,
per-message read gaps, removing polling (it's a permanent backstop).
