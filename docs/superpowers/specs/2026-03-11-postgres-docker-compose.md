# Postgres Backend + Docker Compose Dev Stack

## Overview

Replace in-memory stubs in the fishplate control plane with real Postgres persistence using pgx. Provide a Docker Compose stack (Postgres + control plane + worker) with Air live-reload for local development.

## Design Decisions

- **pgx** as the Postgres driver — direct, no ORM, high performance. Add `github.com/jackc/pgx/v5` to `go.mod`.
- **Repository pattern** — `store.Store` implements existing `dispatcher.DB` and `auth.KeyStore` interfaces. Business logic stays decoupled from data access.
- **No RLS** — tenant filtering via WHERE clauses. RLS enablement tracked in GitHub issue #5. RLS policy and `ENABLE ROW LEVEL SECURITY` statements are removed from migration files so queries work without `SET app.tenant_id`.
- **UUID casting** — all queries use `$1::uuid` casts for UUID column parameters since the Go `Task` struct uses plain `string` fields and pgx sends them as `text`
- **JSONB handling** — `map[string]any` fields (`input`, `result`) are marshaled/unmarshaled via `json.Marshal`/`json.Unmarshal` with pgx custom scan/value types
- **Docker Compose for the full stack** — Postgres, control plane, and worker all containerized
- **Air for live reload** — source volume-mounted into containers, Air watches for changes and rebuilds

## Docker Compose Services

### postgres
- Image: `postgres:16`
- Port: `5432` (mapped to host for direct access/debugging)
- Volume: named volume for data persistence across restarts
- Init: migrations and seed data run via `/docker-entrypoint-initdb.d/`
- Healthcheck: `pg_isready`

### controlplane
- Dockerfile: `docker/go.Dockerfile`
- Volume-mounts the entire repo root to `/repo` so `go.mod` `replace` directives (`../../libs/proto/gen/go`) resolve correctly. WORKDIR set to `/repo/apps/controlplane`.
- Air watches `.go` files, rebuilds and restarts on change
- Depends on: postgres (healthy)
- Env: `DATABASE_URL`, `PORT`, `HOST`

### worker
- Dockerfile: `docker/go.Dockerfile`
- Volume-mounts the entire repo root to `/repo`. WORKDIR set to `/repo/apps/worker`.
- Air watches `.go` files, rebuilds and restarts on change
- Depends on: controlplane (healthy)
- Env: `FISHPLATE_URL`, `FISHPLATE_API_KEY`, `FISHPLATE_TENANT_ID`

## Dockerfile

Single shared `docker/go.Dockerfile` for both Go services:
- Base: `golang:1.25` (matches go.mod `go 1.25.0`)
- Installs Air (`go install github.com/air-verse/air@latest`)
- WORKDIR set to `/app`
- CMD: `air`
- Source code is volume-mounted, not COPYed (dev only)

## Repository Layer

New package: `apps/controlplane/internal/store/`

### store.Store

A single struct holding a `pgxpool.Pool` that implements both interfaces:

```go
type Store struct {
    pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string) (*Store, error)
func (s *Store) Close()

// dispatcher.DB
func (s *Store) CreateTask(ctx context.Context, task *model.Task) error
func (s *Store) ClaimTask(ctx context.Context, tenantID, workerID string) (*model.Task, error)
func (s *Store) CompleteTask(ctx context.Context, taskID string, result map[string]any) error
func (s *Store) FailTask(ctx context.Context, taskID string, errMsg string) error

// auth.KeyStore
func (s *Store) GetTenantByKeyHash(ctx context.Context, keyHash string) (string, error)
```

### Query Details

**CreateTask**: `INSERT INTO tasks (id, tenant_id, execution_id, node_id, handler, input, status, deadline, created_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7, $8, $9)`

Input is `json.Marshal`'d before passing as `$6`.

**ClaimTask**: Atomic claim using `UPDATE ... RETURNING`:
```sql
UPDATE tasks
SET status = 'claimed', worker_id = $2, claimed_at = now()
WHERE id = (
    SELECT id FROM tasks
    WHERE tenant_id = $1::uuid AND status = 'pending'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING id, tenant_id, execution_id, node_id, handler, input, status, worker_id, deadline, created_at, claimed_at
```

When zero rows are affected (no pending tasks), return `(nil, nil)` to match the existing interface contract.

Input column is scanned via `json.Unmarshal` into `map[string]any`.

**CompleteTask**: `UPDATE tasks SET status='completed', result=$2::jsonb, completed_at=now() WHERE id=$1::uuid AND status='claimed'`

Status guard ensures only claimed tasks can be completed.

**FailTask**: `UPDATE tasks SET status='failed', error=$2, completed_at=now() WHERE id=$1::uuid AND status='claimed'`

**GetTenantByKeyHash**: `SELECT tenant_id FROM api_keys WHERE key_hash=$1 AND revoked_at IS NULL`

Returns tenant_id as string (UUID scanned to string).

## Migrations & Seed Data

Existing migration files are edited to remove `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` statements (deferred to issue #5). This is a dev-only modification — RLS will be re-added when enabling tenant isolation at the database level.

New `003_seed_dev.sql`:
- Creates demo tenant (fixed UUID for repeatability)
- Creates demo API key (SHA-256 hash of `fp_demo_key`)
- Creates a sample workflow definition
- Creates a sample workflow execution
- Creates 3 pending tasks: llm_generate, run_tests, deploy_service

## Server Changes

`cmd/server/main.go` simplified:
- Reads `DATABASE_URL` from env
- Creates `store.New(ctx, databaseURL)`
- Passes store to `dispatcher.New(store)` and `auth.New(store)`
- All in-memory stubs, seed logic, and demo constants removed
- Keeps gRPC reflection and h2c support

## Air Configuration

Each Go app gets `.air.toml`:
```toml
[build]
  cmd = "go build -o /tmp/app ./cmd/<name>/"
  bin = "/tmp/app"
  include_ext = ["go"]
  exclude_dir = ["dist", "vendor"]
  exclude_regex = ["_test\\.go$"]
```

## File Structure

```
fishplate/
├── docker-compose.yml
├── docker/
│   └── go.Dockerfile
├── apps/controlplane/
│   ├── .air.toml
│   ├── internal/store/
│   │   └── postgres.go
│   └── migrations/
│       ├── 001_initial.sql      (RLS statements removed)
│       ├── 002_tasks_and_keys.sql (RLS statements removed)
│       └── 003_seed_dev.sql
└── apps/worker/
    └── .air.toml
```

## Out of Scope

- Production Dockerfiles (multi-stage, minimal images)
- Database migration tooling (golang-migrate, goose) — raw SQL via init scripts for now
- Connection pooling config tuning
- Worker health check endpoint
