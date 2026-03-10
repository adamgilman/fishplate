# Fishplate Platform Architecture

## Overview

Fishplate is a workflow orchestration platform with three components:

1. **Control plane (Go)** — DBOS-Go + Postgres. Walks workflow graphs, evaluates CEL conditions, dispatches action tasks, serves ConnectRPC API.
2. **Worker (Go)** — Lightweight binary on developer machines. Polls for tasks, executes handlers, reports results. No database access.
3. **Admin UI (React)** — Visualizes workflow definitions and execution state.

```
Dev machine                        Hosted
┌──────────┐                       ┌─────────────────────┐
│  Worker   │── GetTask ──────────→│  ConnectRPC API     │
│   (Go)    │←── TaskAssignment ───│  (connect-go)       │
│           │── ReportResult ─────→│                     │
└──────────┘                       │  Graph Walker       │
                                   │  CEL-Go             │
┌──────────┐                       │  DBOS-Go + Postgres │
│  Browser  │── HTTP ─────────────→│  Admin UI (static)  │
└──────────┘                       └─────────────────────┘
```

Workers connect outbound to the control plane — no inbound ports needed on dev machines.

## Design Decisions

- **Protobuf is the single source of truth** for all shared types and RPC contracts. Both control plane and worker generate from `.proto` files.
- **Workers only handle `execute_action`** commands. All other graph walker commands (`fork`, `wait_for_signal`, `execute_workflow`, `complete`, `fail`) are handled internally by the control plane via DBOS.
- **Workers are tenant-scoped.** A worker registers with a tenant API key and only receives tasks for that tenant.
- **API key authentication.** Worker passes an API key in metadata on every RPC call. Keys are tenant-scoped, hashed in Postgres.
- **Minimal task payload.** Workers receive handler name + evaluated input + opaque task ID. No graph structure, execution IDs, or workflow context.
- **Fixed-interval polling.** Worker calls `GetTask` on a configurable interval (default 1s). No backoff, no streaming.
- **Go everywhere.** Control plane and worker are both Go. No cross-language protobuf generation needed (except for admin UI if we wire it later).
- **`workflow-core` (TS) becomes a design reference.** The Go control plane reimplements graph walking, CEL evaluation, and validation using native Go libraries.

## ConnectRPC Services

### WorkerService

Called by workers.

```protobuf
service WorkerService {
  rpc GetTask(GetTaskRequest) returns (GetTaskResponse);
  rpc ReportResult(ReportResultRequest) returns (ReportResultResponse);
}

message GetTaskRequest {
  string worker_id = 1;
  string tenant_id = 2;
}

message GetTaskResponse {
  optional string task_id = 1;
  optional string handler = 2;
  optional bytes input = 3; // JSON-encoded evaluated input
}

message ReportResultRequest {
  string task_id = 1;
  enum Status {
    SUCCESS = 0;
    ERROR = 1;
  }
  Status status = 2;
  optional bytes context_updates = 3; // JSON-encoded
  optional string error = 4;
}

message ReportResultResponse {}
```

### AdminService

Called by the admin UI.

```protobuf
service AdminService {
  rpc GetWorkflowExecution(GetWorkflowExecutionRequest) returns (GetWorkflowExecutionResponse);
  rpc ListWorkflowExecutions(ListWorkflowExecutionsRequest) returns (ListWorkflowExecutionsResponse);
  rpc StartWorkflow(StartWorkflowRequest) returns (StartWorkflowResponse);
}
```

## Control Plane Internals

Three layers:

### API Layer

ConnectRPC handlers for WorkerService and AdminService. Validates API keys from metadata, resolves tenant, routes to domain logic.

### Orchestrator

The graph walker. When a workflow starts, DBOS creates a durable workflow function that:

1. Instantiates the walker with the definition + params
2. Calls `walker.Next()` to get the next command
3. For `execute_action`: creates a task row in Postgres (status=pending), then durably waits for the result
4. For `fork`: starts child DBOS workflows for each branch
5. For `wait_for_signal`: calls DBOS recv, blocks until signal or timeout
6. For `complete`/`fail`: writes final state, returns
7. On result received: calls `walker.Resolve()`, loops back to step 2

The walker is pure Go — no DB access, no side effects. It takes a definition and yields commands. All durability comes from DBOS wrapping the orchestrator loop.

### Task Dispatcher

Bridges the orchestrator and workers. Pending tasks sit in a Postgres table. `GetTask` queries for the oldest unclaimed task for the worker's tenant, claims it (atomic row lock), and returns it. `ReportResult` writes the result and unblocks the waiting orchestrator.

## Worker SDK

Three parts:

**Handler registry** — Users register handler functions by name:
```go
worker.Handle("llm_generate", func(input map[string]any) (map[string]any, error) {
    // call LLM API, return context updates
})
```

**Poll loop** — Calls `GetTask` on a fixed interval (configurable, default 1s). On task received, looks up handler by name, executes it, calls `ReportResult` with output or error.

**Configuration** — Control plane URL, API key, worker ID (auto-generated or user-specified), poll interval. Environment variables or config file.

No graph knowledge, no CEL, no Postgres.

## Task Lifecycle

```
pending → claimed → running → completed | failed
```

1. **pending** — Orchestrator creates task row when walker yields `execute_action`
2. **claimed** — Worker's `GetTask` claims it (atomic row update)
3. **running** — Worker executing the handler
4. **completed** — Worker calls `ReportResult` with success + context updates
5. **failed** — Worker calls `ReportResult` with error, or task times out

**Timeout handling**: each task has a deadline (configurable per handler or global default). If a worker claims a task but never reports back, a background sweeper resets it to `pending` after the deadline. Another worker picks it up.

**Exactly-once semantics**: DBOS guarantees the orchestrator won't double-dispatch. Task table + row locking guarantees at-most-one worker claims a task.

## Postgres Schema (new tables)

### tasks

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| tenant_id | UUID FK | |
| execution_id | UUID FK | to workflow_executions |
| node_id | text | which node in the graph |
| handler | text | handler name |
| input | JSONB | evaluated CEL result |
| status | enum | pending, claimed, completed, failed |
| worker_id | text | set on claim |
| result | JSONB | context_updates from worker |
| error | text | |
| deadline | timestamp | for timeout sweeper |
| created_at | timestamp | |
| claimed_at | timestamp | |
| completed_at | timestamp | |

### api_keys

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| tenant_id | UUID FK | |
| key_hash | text | bcrypt/argon2 |
| name | text | human label |
| created_at | timestamp | |
| revoked_at | timestamp | nullable |

Both tables have RLS policies on `tenant_id`.

## Project Structure

```
fishplate/
├── apps/
│   ├── admin-ui/          # React (existing)
│   ├── controlplane/      # Go module — DBOS, graph walker, ConnectRPC server
│   │   ├── go.mod
│   │   ├── cmd/server/
│   │   ├── internal/
│   │   │   ├── orchestrator/   # graph walker, DBOS workflow
│   │   │   ├── dispatcher/     # task table operations
│   │   │   ├── cel/            # cel-go evaluation
│   │   │   ├── api/            # ConnectRPC handlers
│   │   │   └── auth/           # API key validation
│   │   └── migrations/
│   └── worker/            # Go module — polling loop, handler SDK
│       ├── go.mod
│       ├── cmd/worker/
│       └── pkg/worker/    # public SDK (Handle, Run, Config)
├── libs/
│   ├── workflow-core/     # TS (existing, design reference only)
│   └── proto/             # .proto files + buf.gen.yaml
├── docs/
└── ...
```

`controlplane` and `worker` are separate Go modules so the worker binary has zero control plane dependencies and can be distributed independently.

## Out of Scope (first pass)

- **Admin UI wiring** — admin UI continues reading mock data. ConnectRPC AdminService wiring is a follow-up.
- **Workflow CRUD API** — definitions seeded directly in Postgres for now.
- **Worker auto-scaling** — developers run workers manually.
- **Observability** — no tracing, metrics, or structured logging beyond basic stdout.
- **Auth beyond API keys** — no OAuth, RBAC, or key rotation UI.
- **Fork/gate execution** — orchestrator handles `execute_action` + `decision` end-to-end first. Fork and gate come later.

## First Milestone

A workflow with action and decision nodes executes end-to-end:
1. Control plane loads a definition from Postgres
2. Orchestrator walks the graph via DBOS durable workflow
3. At action nodes, a task is created and dispatched
4. Worker polls, executes the handler, reports the result
5. Orchestrator resolves the result, evaluates CEL at decision nodes, continues
6. Workflow completes, final context written to Postgres
