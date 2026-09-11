# EMP HR Assistant

The EMP HR Assistant is a new conversational, live-data layer for the EMP ecosystem. It lets an authorized user ask an HR question in natural language and receive one consolidated answer without opening multiple dashboards.

Example:

> What was Priya Patel's net pay for June, how was her attendance, and what does EmpMonitor show for productivity?

The assistant resolves Priya inside the caller's organization, queries the owning systems, and composes a permission-safe response from current data.

This module is independent of the legacy chatbot. The legacy service and `/chatbot` UI remain available and must not be modified as part of assistant development.

## Why this module exists

EMP data is intentionally distributed across specialized products. That separation is correct for system ownership, but users often need information spanning multiple dashboards. The assistant provides a single conversational access layer while leaving each product authoritative for its own data.

The module was built to:

- answer routine HR questions using live figures rather than model memory;
- combine related facts from multiple EMP products in one response;
- preserve existing tenant, role, and permission boundaries;
- reduce dashboard navigation for read-only reporting and lookup tasks;
- provide a reusable integration pattern for future EMP modules;
- create a safe foundation for later, explicitly confirmed workflow actions.

It is not a replacement database, reporting warehouse, or source of truth. It does not copy module data into EMP Cloud. It queries the owning system when a question is asked.

## Current scope: read-only

The assistant currently reads and explains data only. The model cannot approve, reject, create, update, or delete HR records.

Read-only includes pending leave applications and attendance regularizations: the assistant can list them, but approval and rejection remain in their existing HR workflows. Write actions will be introduced later only through dedicated protected endpoints, explicit user confirmation, domain permissions, audit logging, and existing business services. Mutation tools must never be added casually to the model tool registry.

## Current three-system architecture

| System | Ownership | Assistant access |
| --- | --- | --- |
| EMP Cloud | Identity, organizations, employees, departments, locations, attendance, leave, shifts, permissions, and assistant conversations | Direct organization-scoped service/database reads inside EMP Cloud |
| EMP Payroll | Salary structures, payslips, earnings, deductions, net pay, and payroll runs | Authenticated internal API under `/api/v1/internal/assistant/*` |
| EMP Monitor | Productivity, application/website usage, timesheets, aggregate keystrokes, and AI-tool usage | Authenticated internal API under `/api/v3/internal-service/*` |

EMP Cloud is the orchestration and authorization boundary. It authenticates the user, derives the organization internally, determines visible employees, exposes the assistant API/UI, stores conversation history, and calls Payroll or Monitor when those products own the requested data.

EMP Payroll and EMP Monitor remain authoritative. Their results are returned as JSON to the agent and are not replicated into assistant tables.

### Cross-system request flow

1. The authenticated user sends a message to the buffered or streaming assistant endpoint.
2. EMP Cloud validates the request and checks `assistant:use`.
3. `assistant.service.ts` creates or loads a conversation owned by that user and organization.
4. `scope-resolver.ts` builds an authorization context from the trusted access token.
5. `agent.service.ts` sends conversation context and function definitions through the OpenAI SDK using Chat Completions.
6. The model selects one or more read tools. Up to eight rounds allow employee resolution and cross-module chaining.
7. `tools.ts` validates arguments with Zod and enforces own, team, or organization visibility.
8. EMP Cloud tools read the `empcloud` database; Payroll and Monitor tools call their authenticated internal APIs.
9. Tool JSON is returned to the model as untrusted data for answer composition.
10. The validated answer and unique tool list are persisted and returned or emitted over SSE.

The model never chooses or supplies `organization_id`. EMP Cloud injects it from the authenticated caller for every query and module request.

## API and UI

The new UI is available at `/assistant`. The floating EmpAI launcher opens this route. The sidebar lists only the new HR Assistant; the legacy `/chatbot` route remains available but is intentionally not shown in navigation. Conversation rename uses an accessible in-app form modal, and deletion uses the shared danger confirmation dialog; browser-native prompt/confirm dialogs are not used.

### Buffered message API

`POST /api/v1/assistant`

```json
{
  "message": "What was Priya Patel's net pay for June 2026?",
  "conversation_id": 123
}
```

`conversation_id` is omitted for a new conversation.

```json
{
  "success": true,
  "data": {
    "conversation_id": 123,
    "answer": "Priya Patel's net pay for June 2026 was ...",
    "tools_used": ["search_employees", "get_net_pay"]
  }
}
```

### Streaming message API

`POST /api/v1/assistant/stream`

The streaming endpoint accepts the same body and authentication. It returns Server-Sent Events over the POST response:

- `conversation`: resolved conversation ID;
- `status`: safe progress text and current tool name;
- `delta`: a fragment of the approved final answer;
- `done`: conversation ID and unique `tools_used` after persistence;
- `error`: stable error code and safe message.

Tool planning and final composition stay inside the Chat Completions function-calling loop. Partial function arguments and internal correction prompts are never streamed. After safeguards approve the answer, that exact text is emitted as SSE chunks without a second model rewrite. The route sends keep-alives, sets `X-Accel-Buffering: no`, and supports cancellation through the UI Stop button. An interrupted request is not persisted as a completed exchange.

### Conversation CRUD

- `GET /api/v1/assistant/conversations` lists up to 100 active conversations owned by the caller.
- `GET /api/v1/assistant/conversations/:id` loads one owned conversation and its messages.
- `PATCH /api/v1/assistant/conversations/:id` with `{ "title": "..." }` renames it.
- `DELETE /api/v1/assistant/conversations/:id` soft-deletes it through `archived_at`.

Every operation filters by conversation ID, `organization_id`, `user_id`, and non-archived state. Inaccessible records return 404 rather than revealing another user's conversation.

## Current tool catalogue

### EMP Cloud tools

| Tool | Purpose |
| --- | --- |
| `search_employees` | Resolve a visible employee by name, email, or code, with department/location filters |
| `count_employees` | Count visible employees by status, department, or location |
| `get_attendance` | Read attendance records for an employee and date range |
| `get_leave_balance` | Read leave balances for an employee and fiscal year |
| `get_pending_leave_requests` | List visible pending leave applications with employee, department, location, search, and date filters |
| `get_pending_attendance_regularizations` | List visible pending attendance regularizations with the same organizational filters |
| `get_shift_schedule` | Read an employee's shift assignments over a date range |

Leave ranges use overlap semantics; regularizations filter on their attendance date. Pending workflow tools are strictly read-only.

### EMP Payroll tools

| Tool | Purpose |
| --- | --- |
| `get_salary_structure` | Read an employee's effective salary structure |
| `get_net_pay` | Read monthly gross pay, net pay, earnings, and sanitized deduction line items |
| `get_payroll_run_totals` | Read organization payroll-run totals by run or month/year |

Payroll responses expose only required financial fields. Bank details and tax identifiers are excluded. Monetary ownership and calculations remain in EMP Payroll.

### EMP Monitor tools

| Tool | Purpose |
| --- | --- |
| `get_productivity_summary` | Productivity totals for an employee, team, or organization |
| `get_application_usage` | Application usage over a valid date range |
| `get_website_usage` | Website usage over a valid date range |
| `get_timesheet_details` | Tracked timesheet details |
| `get_keystrokes` | Aggregate keystroke counts only; never typed content |
| `get_employee_wise_ai_usage` | AI-tool usage for one visible employee |
| `get_organization_wise_ai_usage` | Organization-wide AI-tool usage |
| `get_organization_wise_x_application_usage` | Organization users of a named application |
| `get_organization_wise_x_website_usage` | Organization users of a named website |
| `get_employee_wise_x_application_usage` | One employee's usage of a named application |
| `get_employee_wise_x_website_usage` | One employee's usage of a named website |

Every Monitor range must fall within the inclusive last 165 days and may span at most 31 inclusive calendar days. Explicit ranges require both dates, future dates are rejected, and invalid ranges are never silently widened or clamped. These restrictions apply only to EMP Monitor—not EMP Cloud attendance, leave, shifts, or Payroll.

For Monitor scope, `team` normally means direct and additional reports. Generic “the team” or “our team” requests from `hr_admin`/`org_admin` use organization scope. If the model selects team scope and that admin has no reports, the server may fall back to organization scope only when the caller has `monitor:view_all`. Explicit “my direct reports” requests set `direct_reports_only=true`, which disables the fallback and correctly returns that no reports are configured.

## Authorization and data protection

The assistant route requires `assistant:use`. Each tool also checks the existing domain permissions:

- employees: `employees:view`, `employees:view_team`, `employees:view_all`;
- attendance: `attendance:view`, `attendance:view_team`, `attendance:view_all`, plus regularization permissions where applicable;
- leave: `leave:view`, `leave:view_team`, `leave:view_all`, `leave:approve` for approval-queue visibility;
- salary: `salary:view`, `salary:view_all`;
- payroll: `payroll:view_own`, `payroll:view_all`, `payroll:view_reports`;
- monitoring: `monitor:view_own`, `monitor:view_team`, `monitor:view_all`.

Security invariants:

- every database query includes `organization_id`;
- target employees must exist in the caller's organization;
- own/team/all scope is computed server-side;
- cross-module requests carry the trusted organization ID and internal secret;
- tool arguments are validated and unknown fields are rejected;
- model output cannot grant access or widen scope;
- tool output is untrusted content and cannot override system instructions;
- API keys, tokens, secrets, raw provider responses, and sensitive tool arguments must not be logged;
- aggregate keystroke data must never be presented as typed content.

Migration `099_ai_assistant.ts` creates the conversation tables and seeds `assistant:use` into system role defaults.

## Agent behavior and safeguards

- Live-data questions must use tools rather than unsupported prose.
- The current UTC server date is injected into every agent request. Current-month Monitor questions are interpreted month-to-date, and relative ranges use server-derived dates rather than model memory.
- Employee names are resolved through `search_employees`; users are not asked for internal IDs.
- Multi-domain comparisons must call every requested domain tool.
- Timesheet questions must call `get_timesheet_details`; resolving an employee alone is not considered a complete lookup.
- Pending leave and regularization questions require their exact workflow tools; balances or raw attendance are not substitutes.
- Payroll answers must include the requested period and currency.
- Returned earnings and deductions must be used when explaining a payslip.
- Identical tool calls reuse the first result instead of repeatedly hitting a module.
- Corrective prompts are bounded to prevent loops.
- At the tool-round ceiling, a final no-tools synthesis returns the best supported answer instead of a round-limit failure.
- Unavailable domains are identified without discarding successful results from other systems.

## OpenAI and module configuration

The assistant uses OpenAI Chat Completions for OpenAI-compatible providers. When a Gemini model is configured with the centralized `/nx/direct` proxy, it automatically uses the native Google Gen AI `generateContent` API and preserves the same server-controlled tool loop.

```env
ASSISTANT_OPENAI_API_KEY=
# Preferred key for the direct Gemini proxy; falls back to GLB_KEY and then ASSISTANT_OPENAI_API_KEY.
ASSISTANT_GEMINI_API_KEY=
GLB_KEY=
ASSISTANT_OPENAI_BASE_URL=
ASSISTANT_OPENAI_ORGANIZATION=
ASSISTANT_OPENAI_PROJECT=
ASSISTANT_MODEL=gpt-5.6
ASSISTANT_USE_LEGACY_MAX_TOKENS=false
ASSISTANT_MAX_TOKENS=2048
ASSISTANT_MAX_TOOL_ROUNDS=8
ASSISTANT_PROVIDER_MAX_RETRIES=2
ASSISTANT_PROVIDER_RETRY_BASE_MS=500
ASSISTANT_MODULE_MAX_RETRIES=2
ASSISTANT_MODULE_RETRY_BASE_MS=300
# Disabled by default. Enable temporarily to include complete tool JSON in diagnostic logs.
ASSISTANT_LOG_TOOL_RESPONSES=false

PAYROLL_MODULE_URL=http://localhost:4000
MONITOR_MODULE_URL=http://localhost:5000
INTERNAL_SERVICE_SECRET=
```

Assistant-specific OpenAI settings fall back to their global OpenAI equivalents. The direct Gemini proxy is detected when `ASSISTANT_MODEL` starts with `gemini` and `ASSISTANT_OPENAI_BASE_URL` ends in `/nx/direct`. Set `ASSISTANT_USE_LEGACY_MAX_TOKENS=true` only for OpenAI-compatible providers that require `max_tokens`; it is ignored by the native Gemini client.

EMP Cloud sends `x-internal-service` and `x-internal-secret` to Payroll and Monitor. The same non-empty `INTERNAL_SERVICE_SECRET` must be configured in all three running services. Restart each process after environment changes.

Every tool call writes an `Assistant tool result` structured log containing its outcome, safe date/scope arguments, response field names, collection sizes, and the exact tool error when one occurs. Successful HR payload values are excluded by default. For short-lived debugging in a controlled environment, set `ASSISTANT_LOG_TOOL_RESPONSES=true` to include the complete tool JSON; disable it again after diagnosis because those payloads can contain employee, attendance, monitoring, or payroll data.

For EmpMonitor, internal API health also depends on working `MYSQL_*` settings in the Admin service. A MySQL 500/503 is a Monitor database configuration problem, not assistant-user authentication.

## Retries and stable errors

Provider network failures, HTTP 408/409/429, and 5xx responses use bounded exponential backoff; `Retry-After` is honored. Authentication, credit, invalid-model, and invalid-request failures are not retried. Payroll and Monitor transport failures use separate bounded module retries.

Stable error codes include:

- `ASSISTANT_NOT_CONFIGURED`
- `ASSISTANT_PROVIDER_AUTH_FAILED`
- `ASSISTANT_PROVIDER_CREDITS_REQUIRED`
- `ASSISTANT_MODEL_UNAVAILABLE`
- `ASSISTANT_PROVIDER_RATE_LIMITED`
- `ASSISTANT_PROVIDER_UNAVAILABLE`
- `ASSISTANT_EMPTY_RESPONSE`
- `MODULE_AUTH_NOT_CONFIGURED`
- `MODULE_REQUEST_FAILED`
- `MODULE_UNAVAILABLE`

Raw messages such as `fetch failed` are not exposed to the user.

## Future EMP ecosystem expansion

The assistant is designed to add module capabilities without moving ownership into EMP Cloud. Expected read-only expansion areas include:

| Future module | Example conversational capabilities |
| --- | --- |
| EMP Exit | Exit cases, clearance progress, notice periods, attrition summaries |
| EMP Rewards | Recognition history, reward balances, award summaries |
| EMP Performance | Review cycles, goals, ratings, competency summaries |
| EMP Recruit | Open positions, candidate pipelines, interview status, hiring summaries |
| EMP LMS | Assigned courses, completion status, certifications, learning progress |
| EMP Field | Field attendance, visits, travel activity, location-safe operational summaries |
| EMP Projects | Project assignments, tasks, utilization, delivery summaries |
| EMP Biometrics | Device status, sync health, and permission-safe biometric attendance summaries |

Expansion principles:

1. The owning module exposes a narrow internal read API; EMP Cloud does not query another module's database directly.
2. The module authenticates `INTERNAL_SERVICE_SECRET` and independently enforces `organization_id`.
3. EMP Cloud adds explicit permission slugs before exposing sensitive data.
4. The assistant tool uses a closed JSON schema and Zod validation.
5. Own/team/organization scope is resolved in EMP Cloud and revalidated where appropriate by the module.
6. Responses return only fields needed for the question; secrets and unnecessary identifiers are removed.
7. Tool-specific retention, date, pagination, and volume limits are enforced server-side.
8. Unit tests, a live read-only smoke test, and authenticated Playwright coverage are added.
9. This README and the owning module's integration documentation are updated together.

### Later transition to working tasks

Future write capabilities may include approving or rejecting leave/regularization requests and initiating supported module workflows. They must use a different safety path from read tools:

- the model may identify and propose an action, but must not silently execute it;
- the UI must show the exact target, effect, and confirmation controls;
- mutations must use dedicated endpoints rather than ordinary read-tool execution;
- existing domain services and business validations must be reused;
- the caller's action permission and target scope must be rechecked at execution time;
- self-approval and already-processed protections must remain enforced;
- decline/reject reasons must be collected when the workflow requires them;
- every mutation must be organization-scoped, idempotent where possible, and audit-logged;
- cancellation and partial failures must leave records in a consistent state.

Until those controls are implemented and explicitly approved, the assistant remains read-only.

## Files and extension points

- `agent.service.ts`: Chat Completions loop, retries, tool orchestration, correction safeguards, and final-answer emission.
- `assistant.service.ts`: conversation ownership, persistence, rollback, and streaming callbacks.
- `tools.ts`: tool definitions, closed schemas, validation, and executors.
- `scope-resolver.ts`: own/team/all permission enforcement.
- `module-client.ts`: authenticated Payroll/Monitor HTTP client and module retries.
- `packages/server/src/api/routes/assistant.routes.ts`: buffered, streaming, and conversation routes.
- `packages/client/src/pages/assistant/AssistantPage.tsx`: full-page chat UI, history, Markdown, progress, and Stop control.
- `packages/server/src/db/migrations/099_ai_assistant.ts`: persistence and permission migration.
- `packages/server/src/scripts/smoke-assistant-tools.ts`: live read-only tool verification.
- `e2e/e2e-assistant.spec.ts`: authenticated API/UI coverage.

## Validation

Focused tests:

```bash
pnpm --filter @empcloud/server test -- assistant-agent.test.ts assistant-tools.test.ts assistant-module-client.test.ts
```

Live read-only smoke test:

```powershell
.\packages\server\node_modules\.bin\tsx.cmd packages/server/src/scripts/smoke-assistant-tools.ts
```

The smoke script supports `SMOKE_ORG_ID`, `SMOKE_EMPLOYEE_ID`, `SMOKE_START_DATE`, and `SMOKE_END_DATE`. It runs every registered tool once, prints pass/fail details without dumping sensitive data, closes its database connection, and exits non-zero on failure. On 2026-07-20, all 21 registered tools passed locally for organization 1 and employee 3 over 2026-06-20 through 2026-07-20.

Type checks and frontend build:

```bash
pnpm --filter @empcloud/server typecheck
pnpm --filter @empcloud/client typecheck
pnpm --filter @empcloud/client build
```

Playwright:

```bash
npx playwright test e2e/e2e-assistant.spec.ts --list
npx playwright test e2e/e2e-assistant.spec.ts
```

Playwright must authenticate through the real login page; never inject authentication through local storage.

## Maintenance rule

Update this README whenever tools, permissions, module contracts, configuration, retention rules, streaming behavior, error handling, UI routes, tests, or the read/write safety boundary changes. New module integrations are incomplete until their ownership, authentication, permissions, limits, and validation steps are documented here.
