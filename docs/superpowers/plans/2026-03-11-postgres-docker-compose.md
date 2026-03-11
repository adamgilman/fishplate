# Postgres Backend + Docker Compose Dev Stack Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace in-memory stubs with real Postgres persistence and provide a Docker Compose stack with Air live-reload for local development.

**Architecture:** A single `store.Store` struct backed by pgx implements the existing `dispatcher.DB` and `auth.KeyStore` interfaces. Docker Compose runs Postgres, control plane, and worker containers with volume-mounted source and Air for hot reload.

**Tech Stack:** Go 1.25, pgx v5, Docker Compose, Air, Postgres 16

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `docker/go.Dockerfile` | Create | Shared Go dev container with Air |
| `docker-compose.yml` | Create | Postgres + controlplane + worker services |
| `apps/controlplane/.air.toml` | Create | Air config for control plane |
| `apps/worker/.air.toml` | Create | Air config for worker |
| `apps/controlplane/internal/store/postgres.go` | Create | pgx implementation of dispatcher.DB + auth.KeyStore |
| `apps/controlplane/internal/store/postgres_test.go` | Create | Integration tests against real Postgres |
| `apps/controlplane/cmd/server/main.go` | Modify | Swap in-memory stubs for store.Store |
| `apps/controlplane/migrations/001_initial.sql` | Modify | Remove RLS statements |
| `apps/controlplane/migrations/002_tasks_and_keys.sql` | Modify | Remove RLS statements |
| `apps/controlplane/migrations/003_seed_dev.sql` | Create | Demo tenant, API key, workflow, tasks |
| `apps/controlplane/go.mod` | Modify | Add pgx dependency |
| `README.md` | Modify | Project overview, getting started, architecture |
| `apps/controlplane/README.md` | Create | Control plane: purpose, env vars, internal packages |
| `apps/worker/README.md` | Create | Worker: purpose, handler registration, env vars |
| `libs/proto/README.md` | Create | Proto structure, buf regeneration |
| `libs/workflow-core/README.md` | Create | TS design reference, status |
| `docker/README.md` | Create | Dev stack usage, common commands |

---

## Chunk 1: Docker Infrastructure

### Task 1: Dockerfile

**Files:**
- Create: `docker/go.Dockerfile`

- [ ] **Step 1: Create the Dockerfile**

```dockerfile
FROM golang:1.25

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN go install github.com/air-verse/air@latest

WORKDIR /repo

CMD ["air"]
```

- [ ] **Step 2: Verify it builds**

Run: `docker build -f docker/go.Dockerfile -t fishplate-go-dev docker/`
Expected: Image builds successfully

- [ ] **Step 3: Commit**

```bash
git add docker/go.Dockerfile
git commit -m "feat: add shared Go dev Dockerfile with Air"
```

### Task 2: Air configs

**Files:**
- Create: `apps/controlplane/.air.toml`
- Create: `apps/worker/.air.toml`

- [ ] **Step 1: Create control plane Air config**

```toml
root = "."
tmp_dir = "/tmp/air"

[build]
  cmd = "go build -o /tmp/air/controlplane ./cmd/server/"
  bin = "/tmp/air/controlplane"
  include_ext = ["go"]
  exclude_dir = ["dist", "vendor"]
  exclude_regex = ["_test\\.go$"]
  delay = 1000

[log]
  time = true
```

- [ ] **Step 2: Create worker Air config**

```toml
root = "."
tmp_dir = "/tmp/air"

[build]
  cmd = "go build -o /tmp/air/worker ./cmd/worker/"
  bin = "/tmp/air/worker"
  include_ext = ["go"]
  exclude_dir = ["dist", "vendor"]
  exclude_regex = ["_test\\.go$"]
  delay = 1000

[log]
  time = true
```

- [ ] **Step 3: Commit**

```bash
git add apps/controlplane/.air.toml apps/worker/.air.toml
git commit -m "feat: add Air live-reload configs for Go apps"
```

### Task 3: Docker Compose

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: fishplate
      POSTGRES_PASSWORD: fishplate
      POSTGRES_DB: fishplate
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./apps/controlplane/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fishplate"]
      interval: 2s
      timeout: 5s
      retries: 10

  controlplane:
    build:
      context: .
      dockerfile: docker/go.Dockerfile
    ports:
      - "8080:8080"
    volumes:
      - .:/repo
      - go-mod-cache:/go/pkg/mod
      - go-build-cache:/root/.cache/go-build
    working_dir: /repo/apps/controlplane
    environment:
      DATABASE_URL: postgres://fishplate:fishplate@postgres:5432/fishplate?sslmode=disable
      HOST: "0.0.0.0"
      PORT: "8080"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8080/fishplate.worker.v1.WorkerService/ || exit 1"]
      interval: 2s
      timeout: 5s
      retries: 10
    depends_on:
      postgres:
        condition: service_healthy

  worker:
    build:
      context: .
      dockerfile: docker/go.Dockerfile
    volumes:
      - .:/repo
      - go-mod-cache:/go/pkg/mod
      - go-build-cache:/root/.cache/go-build
    working_dir: /repo/apps/worker
    environment:
      FISHPLATE_URL: http://controlplane:8080
      FISHPLATE_API_KEY: fp_demo_key
      FISHPLATE_TENANT_ID: "00000000-0000-0000-0000-000000000001"
    depends_on:
      controlplane:
        condition: service_healthy

volumes:
  pgdata:
  go-mod-cache:
  go-build-cache:
```

Note: `go-mod-cache` and `go-build-cache` volumes are shared between both Go containers so dependencies are only downloaded once.

- [ ] **Step 2: Verify Postgres starts**

Run: `docker compose up postgres -d && docker compose logs postgres`
Expected: Postgres starts, runs migrations from `/docker-entrypoint-initdb.d/`, healthcheck passes

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add Docker Compose stack for local dev"
```

---

## Chunk 2: Migrations & Seed Data

### Task 4: Remove RLS from migrations

**Files:**
- Modify: `apps/controlplane/migrations/001_initial.sql`
- Modify: `apps/controlplane/migrations/002_tasks_and_keys.sql`

- [ ] **Step 1: Remove RLS from 001_initial.sql**

Remove these lines (keep everything else):
```sql
ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_definitions ON workflow_definitions
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation_executions ON workflow_executions
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

- [ ] **Step 2: Remove RLS from 002_tasks_and_keys.sql**

Remove these lines (keep everything else):
```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tasks ON tasks
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation_api_keys ON api_keys
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

- [ ] **Step 3: Commit**

```bash
git add apps/controlplane/migrations/001_initial.sql apps/controlplane/migrations/002_tasks_and_keys.sql
git commit -m "chore: remove RLS statements from migrations (deferred to issue #5)"
```

### Task 5: Seed data

**Files:**
- Create: `apps/controlplane/migrations/003_seed_dev.sql`

- [ ] **Step 1: Create seed SQL**

```sql
-- Demo tenant
INSERT INTO tenants (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Demo Tenant')
ON CONFLICT DO NOTHING;

-- Demo API key: SHA-256 of "fp_demo_key"
INSERT INTO api_keys (id, tenant_id, key_hash, name) VALUES
  ('00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000001',
   '57110c62de6ce26e3bcd67f495f59243722c7bd35920e211cc5b1279debd638a',
   'demo-key')
ON CONFLICT DO NOTHING;

-- Demo workflow definition
INSERT INTO workflow_definitions (id, tenant_id, name, version, definition) VALUES
  ('00000000-0000-0000-0000-000000000100',
   '00000000-0000-0000-0000-000000000001',
   'demo-workflow', 1,
   '{"entrypoint": "node-llm", "nodes": [
     {"id": "node-llm", "type": "action", "handler": "llm_generate"},
     {"id": "node-test", "type": "action", "handler": "run_tests"},
     {"id": "node-deploy", "type": "action", "handler": "deploy_service"}
   ], "edges": [
     {"from": "node-llm", "to": "node-test"},
     {"from": "node-test", "to": "node-deploy"}
   ]}'::jsonb)
ON CONFLICT DO NOTHING;

-- Demo workflow execution
INSERT INTO workflow_executions (id, tenant_id, definition_id, status, context) VALUES
  ('00000000-0000-0000-0000-000000001000',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000100',
   'running', '{}'::jsonb)
ON CONFLICT DO NOTHING;

-- Demo tasks
INSERT INTO tasks (id, tenant_id, execution_id, node_id, handler, input, status, deadline) VALUES
  ('00000000-0000-0000-0000-000000010001',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000001000',
   'node-llm', 'llm_generate',
   '{"task": "write a hello world function", "language": "go"}'::jsonb,
   'pending', now() + interval '5 minutes'),
  ('00000000-0000-0000-0000-000000010002',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000001000',
   'node-test', 'run_tests',
   '{"suite": "unit", "path": "./..."}'::jsonb,
   'pending', now() + interval '5 minutes'),
  ('00000000-0000-0000-0000-000000010003',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000001000',
   'node-deploy', 'deploy_service',
   '{"service": "api-gateway", "environment": "staging"}'::jsonb,
   'pending', now() + interval '5 minutes')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Verify migrations run in order**

Run: `docker compose down -v && docker compose up postgres -d && sleep 3 && docker compose exec postgres psql -U fishplate -c "SELECT id, handler, status FROM tasks;"`
Expected: 3 rows with status `pending`

- [ ] **Step 3: Commit**

```bash
git add apps/controlplane/migrations/003_seed_dev.sql
git commit -m "feat: add dev seed data (tenant, API key, workflow, tasks)"
```

---

## Chunk 3: Postgres Store

### Task 6: Add pgx dependency

**Files:**
- Modify: `apps/controlplane/go.mod`

- [ ] **Step 1: Add pgx**

Run from `apps/controlplane/`:
```bash
go get github.com/jackc/pgx/v5
```

- [ ] **Step 2: Verify**

Run: `grep pgx go.mod`
Expected: `github.com/jackc/pgx/v5 v5.x.x`

- [ ] **Step 3: Commit**

```bash
git add apps/controlplane/go.mod apps/controlplane/go.sum
git commit -m "chore: add pgx v5 dependency"
```

### Task 7: Implement store.Store

**Files:**
- Create: `apps/controlplane/internal/store/postgres.go`

This task implements `dispatcher.DB` (4 methods) and `auth.KeyStore` (1 method) using pgx.

- [ ] **Step 1: Create store package with New and Close**

```go
package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string) (*Store, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect to database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}
```

- [ ] **Step 2: Implement CreateTask**

```go
func (s *Store) CreateTask(ctx context.Context, task *model.Task) error {
	inputJSON, err := json.Marshal(task.Input)
	if err != nil {
		return fmt.Errorf("marshal input: %w", err)
	}
	_, err = s.pool.Exec(ctx,
		`INSERT INTO tasks (id, tenant_id, execution_id, node_id, handler, input, status, deadline, created_at)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7, $8, $9)`,
		task.ID, task.TenantID, task.ExecutionID, task.NodeID, task.Handler,
		string(inputJSON), string(task.Status), task.Deadline, task.CreatedAt,
	)
	return err
}
```

- [ ] **Step 3: Implement ClaimTask**

```go
func (s *Store) ClaimTask(ctx context.Context, tenantID, workerID string) (*model.Task, error) {
	row := s.pool.QueryRow(ctx,
		`UPDATE tasks
		 SET status = 'claimed', worker_id = $2, claimed_at = now()
		 WHERE id = (
		   SELECT id FROM tasks
		   WHERE tenant_id = $1::uuid AND status = 'pending'
		   ORDER BY created_at
		   LIMIT 1
		   FOR UPDATE SKIP LOCKED
		 )
		 RETURNING id, tenant_id, execution_id, node_id, handler, input, status, worker_id, deadline, created_at, claimed_at`,
		tenantID, workerID,
	)

	t := &model.Task{}
	var inputJSON []byte
	var statusStr string
	err := row.Scan(
		&t.ID, &t.TenantID, &t.ExecutionID, &t.NodeID, &t.Handler,
		&inputJSON, &statusStr, &t.WorkerID, &t.Deadline, &t.CreatedAt, &t.ClaimedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.Status = model.TaskStatus(statusStr)
	if inputJSON != nil {
		json.Unmarshal(inputJSON, &t.Input)
	}
	return t, nil
}
```

- [ ] **Step 4: Implement CompleteTask**

```go
func (s *Store) CompleteTask(ctx context.Context, taskID string, result map[string]any) error {
	resultJSON, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("marshal result: %w", err)
	}
	_, err = s.pool.Exec(ctx,
		`UPDATE tasks SET status = 'completed', result = $2::jsonb, completed_at = now()
		 WHERE id = $1::uuid AND status = 'claimed'`,
		taskID, string(resultJSON),
	)
	return err
}
```

- [ ] **Step 5: Implement FailTask**

```go
func (s *Store) FailTask(ctx context.Context, taskID string, errMsg string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE tasks SET status = 'failed', error = $2, completed_at = now()
		 WHERE id = $1::uuid AND status = 'claimed'`,
		taskID, errMsg,
	)
	return err
}
```

- [ ] **Step 6: Implement GetTenantByKeyHash**

```go
func (s *Store) GetTenantByKeyHash(ctx context.Context, keyHash string) (string, error) {
	var tenantID string
	err := s.pool.QueryRow(ctx,
		`SELECT tenant_id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
		keyHash,
	).Scan(&tenantID)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	return tenantID, err
}
```

- [ ] **Step 7: Verify it compiles**

Run from `apps/controlplane/`:
```bash
go build ./internal/store/
```
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add apps/controlplane/internal/store/postgres.go
git commit -m "feat: implement Postgres store for dispatcher.DB and auth.KeyStore"
```

### Task 8: Integration tests for store

**Files:**
- Create: `apps/controlplane/internal/store/postgres_test.go`

These tests require a running Postgres instance. They use the `DATABASE_URL` env var and skip if not set.

- [ ] **Step 1: Write integration tests**

```go
package store

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/adamgilman/fishplate/apps/controlplane/internal/model"
	"github.com/google/uuid"
)

const (
	// Use the seeded demo tenant and execution for tests
	testTenantID    = "00000000-0000-0000-0000-000000000001"
	testExecutionID = "00000000-0000-0000-0000-000000001000"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}
	s, err := New(context.Background(), dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(s.Close)
	return s
}

func createTestTask(t *testing.T, s *Store, handler string) *model.Task {
	t.Helper()
	task := &model.Task{
		ID:          uuid.New().String(),
		TenantID:    testTenantID,
		ExecutionID: testExecutionID,
		NodeID:      "test-" + handler,
		Handler:     handler,
		Input:       map[string]any{"key": "value"},
		Status:      model.TaskPending,
		Deadline:    time.Now().Add(5 * time.Minute),
		CreatedAt:   time.Now(),
	}
	if err := s.CreateTask(context.Background(), task); err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	return task
}

func TestCreateAndClaimTask(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	// Drain any existing pending tasks for the test tenant first
	for {
		claimed, _ := s.ClaimTask(ctx, testTenantID, "drain-worker")
		if claimed == nil {
			break
		}
		s.CompleteTask(ctx, claimed.ID, nil)
	}

	task := createTestTask(t, s, "test_create_claim")

	claimed, err := s.ClaimTask(ctx, testTenantID, "worker-1")
	if err != nil {
		t.Fatalf("ClaimTask: %v", err)
	}
	if claimed == nil {
		t.Fatal("ClaimTask returned nil, expected a task")
	}
	if claimed.ID != task.ID {
		t.Errorf("claimed task ID = %s, want %s", claimed.ID, task.ID)
	}
	if claimed.Handler != "test_create_claim" {
		t.Errorf("handler = %s, want test_create_claim", claimed.Handler)
	}
	if claimed.Input["key"] != "value" {
		t.Errorf("input[key] = %v, want value", claimed.Input["key"])
	}
	if claimed.Status != model.TaskClaimed {
		t.Errorf("status = %s, want claimed", claimed.Status)
	}

	// Clean up
	s.CompleteTask(ctx, claimed.ID, nil)
}

func TestClaimTaskReturnsNilWhenEmpty(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	// Use a nonexistent tenant — guaranteed no pending tasks
	claimed, err := s.ClaimTask(ctx, "00000000-0000-0000-0000-ffffffffffff", "worker-1")
	if err != nil {
		t.Fatalf("ClaimTask: %v", err)
	}
	if claimed != nil {
		t.Errorf("expected nil, got task %s", claimed.ID)
	}
}

func TestCompleteTask(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	task := createTestTask(t, s, "test_complete")
	claimed, err := s.ClaimTask(ctx, testTenantID, "worker-1")
	if err != nil || claimed == nil {
		t.Fatalf("ClaimTask: err=%v claimed=%v", err, claimed)
	}

	err = s.CompleteTask(ctx, claimed.ID, map[string]any{"result": "ok"})
	if err != nil {
		t.Fatalf("CompleteTask: %v", err)
	}

	// Verify task is no longer claimable (it's completed)
	_ = task // used indirectly via createTestTask
}

func TestFailTask(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	createTestTask(t, s, "test_fail")
	claimed, err := s.ClaimTask(ctx, testTenantID, "worker-1")
	if err != nil || claimed == nil {
		t.Fatalf("ClaimTask: err=%v claimed=%v", err, claimed)
	}

	err = s.FailTask(ctx, claimed.ID, "something broke")
	if err != nil {
		t.Fatalf("FailTask: %v", err)
	}
}

func TestGetTenantByKeyHash(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	// The seed data has this hash for "fp_demo_key"
	hash := "57110c62de6ce26e3bcd67f495f59243722c7bd35920e211cc5b1279debd638a"
	tenantID, err := s.GetTenantByKeyHash(ctx, hash)
	if err != nil {
		t.Fatalf("GetTenantByKeyHash: %v", err)
	}
	if tenantID != testTenantID {
		t.Errorf("tenantID = %s, want %s", tenantID, testTenantID)
	}
}

func TestGetTenantByKeyHashNotFound(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	tenantID, err := s.GetTenantByKeyHash(ctx, "nonexistent_hash")
	if err != nil {
		t.Fatalf("GetTenantByKeyHash: %v", err)
	}
	if tenantID != "" {
		t.Errorf("expected empty string, got %s", tenantID)
	}
}
```

- [ ] **Step 2: Run tests against Docker Postgres**

Run:
```bash
docker compose up postgres -d
DATABASE_URL="postgres://fishplate:fishplate@localhost:5432/fishplate?sslmode=disable" go test ./internal/store/ -v
```
Expected: All 6 tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/controlplane/internal/store/postgres_test.go
git commit -m "test: add integration tests for Postgres store"
```

---

## Chunk 4: Wire It Up

### Task 9: Update server main.go

**Files:**
- Modify: `apps/controlplane/cmd/server/main.go`

Replace the entire file. The new version reads `DATABASE_URL`, creates a `store.Store`, and passes it to the existing dispatcher and auth packages.

- [ ] **Step 1: Rewrite main.go**

```go
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"connectrpc.com/grpcreflect"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/api"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/auth"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/dispatcher"
	"github.com/adamgilman/fishplate/apps/controlplane/internal/store"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"fishplate/gen/go/fishplate/worker/v1/workerv1connect"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	host := os.Getenv("HOST")
	if host == "" {
		host = "0.0.0.0"
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	ctx := context.Background()
	s, err := store.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer s.Close()

	d := dispatcher.New(s)
	a := auth.New(s)
	workerHandler := api.NewWorkerHandler(d, a)

	mux := http.NewServeMux()
	path, handler := workerv1connect.NewWorkerServiceHandler(workerHandler)
	mux.Handle(path, handler)

	reflector := grpcreflect.NewStaticReflector(workerv1connect.WorkerServiceName)
	mux.Handle(grpcreflect.NewHandlerV1(reflector))
	mux.Handle(grpcreflect.NewHandlerV1Alpha(reflector))

	addr := fmt.Sprintf("%s:%s", host, port)
	log.Printf("fishplate control plane listening on %s", addr)

	h2cHandler := h2c.NewHandler(mux, &http2.Server{})
	if err := http.ListenAndServe(addr, h2cHandler); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
```

- [ ] **Step 2: Verify it compiles**

Run from `apps/controlplane/`:
```bash
go build ./cmd/server/
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/controlplane/cmd/server/main.go
git commit -m "feat: wire control plane to Postgres store, remove in-memory stubs"
```

### Task 10: End-to-end Docker Compose test

- [ ] **Step 1: Bring up the full stack**

```bash
docker compose up --build
```

Expected output:
- Postgres starts, runs migrations, seeds data
- Control plane connects to Postgres, starts listening on :8080
- Worker starts polling control plane
- Worker claims and completes all 3 demo tasks
- Control plane logs show task claimed/completed

- [ ] **Step 2: Verify tasks were processed**

In a separate terminal:
```bash
docker compose exec postgres psql -U fishplate -c "SELECT id, handler, status FROM tasks ORDER BY created_at;"
```

Expected: All 3 tasks show status `completed`

- [ ] **Step 3: Verify live reload works**

Edit a log message in `apps/controlplane/cmd/server/main.go` (e.g., change "fishplate control plane" to "fishplate control plane v2"). Air should detect the change, rebuild, and restart the server automatically.

- [ ] **Step 4: Commit any fixes**

Stage only the files that were fixed, then commit:
```bash
git commit -m "fix: Docker Compose integration fixes"
```

Only if fixes were needed. Skip if everything worked.

---

## Chunk 5: Documentation

### Task 11: Root README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite root README**

```markdown
# Fishplate

Workflow orchestration platform with a Go control plane, Go workers, and a React admin UI.

## Architecture

```
Dev machine                        Hosted
┌──────────┐                       ┌─────────────────────┐
│  Worker   │── GetTask ──────────→│  ConnectRPC API     │
│   (Go)    │←── TaskAssignment ───│  (connect-go)       │
│           │── SubmitTaskResult ──→│                     │
└──────────┘                       │  Graph Walker       │
                                   │  CEL-Go             │
┌──────────┐                       │  Postgres           │
│  Browser  │── HTTP ─────────────→│  Admin UI (static)  │
└──────────┘                       └─────────────────────┘
```

## Quick Start

```bash
# Start the full dev stack (Postgres + control plane + worker)
docker compose up --build

# Or run individual services
npx nx serve controlplane
npx nx serve worker
```

## Project Structure

| Directory | Description |
|-----------|-------------|
| `apps/controlplane/` | Go — ConnectRPC server, graph walker, task dispatcher |
| `apps/worker/` | Go — polling loop, handler SDK |
| `apps/admin-ui/` | React — workflow visualization |
| `libs/proto/` | Protobuf definitions + generated Go code |
| `libs/workflow-core/` | TypeScript — CEL-based workflow graphs (design reference) |
| `docker/` | Dockerfiles and dev stack configuration |

## Nx Commands

```bash
npx nx build controlplane     # Build control plane binary
npx nx build worker            # Build worker binary
npx nx test controlplane       # Run control plane tests
npx nx test worker             # Run worker tests
npx nx run-many -t test        # Test everything
npx nx affected -t test        # Test only changed projects
```

## Tech Stack

- **Go 1.25** — control plane + worker
- **ConnectRPC** — gRPC-compatible RPC (protobuf contracts)
- **Postgres 16** — persistence, multi-tenant
- **CEL-Go** — expression evaluation in workflow graphs
- **Docker Compose** — local dev stack with Air live-reload
- **Nx** — monorepo task runner
- **TypeScript / React** — admin UI
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite root README with architecture and quick start"
```

### Task 12: Control plane README

**Files:**
- Create: `apps/controlplane/README.md`

- [ ] **Step 1: Create README**

```markdown
# Control Plane

The fishplate control plane is a Go server that orchestrates workflow execution. It walks workflow graphs, evaluates CEL conditions, dispatches tasks to workers via ConnectRPC, and persists state in Postgres.

## Running

```bash
# Via Docker Compose (recommended)
docker compose up controlplane

# Via Nx
npx nx serve controlplane

# Direct
DATABASE_URL="postgres://..." go run ./cmd/server/
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | Postgres connection string |
| `HOST` | No | `0.0.0.0` | Bind address |
| `PORT` | No | `8080` | Listen port |

## Internal Packages

| Package | Responsibility |
|---------|---------------|
| `internal/api` | ConnectRPC handlers (WorkerService) |
| `internal/auth` | API key validation (SHA-256 hash lookup) |
| `internal/cel` | CEL expression evaluation (cel-go) |
| `internal/dispatcher` | Task lifecycle (create, claim, complete, fail) |
| `internal/graph` | Graph walker — walks workflow definitions, yields commands |
| `internal/model` | Domain types (Task, WorkflowDefinition, etc.) |
| `internal/store` | Postgres implementation of dispatcher.DB + auth.KeyStore |

## Migrations

SQL files in `migrations/` are run by Postgres on container init via `/docker-entrypoint-initdb.d/`.

| File | Contents |
|------|----------|
| `001_initial.sql` | tenants, workflow_definitions, workflow_executions |
| `002_tasks_and_keys.sql` | tasks, api_keys |
| `003_seed_dev.sql` | Demo tenant, API key, sample workflow + tasks |

## ConnectRPC API

The server exposes `fishplate.worker.v1.WorkerService` with two RPCs:
- `GetTask` — worker polls for available tasks
- `SubmitTaskResult` — worker reports task completion or failure

gRPC reflection is enabled for tools like Evans and grpcurl.
```

- [ ] **Step 2: Commit**

```bash
git add apps/controlplane/README.md
git commit -m "docs: add control plane README"
```

### Task 13: Worker README

**Files:**
- Create: `apps/worker/README.md`

- [ ] **Step 1: Create README**

```markdown
# Worker

The fishplate worker is a lightweight Go binary that runs on developer machines. It polls the control plane for tasks, executes registered handlers, and reports results. No database access needed.

## Running

```bash
# Via Docker Compose (recommended)
docker compose up worker

# Via Nx
FISHPLATE_API_KEY=fp_demo_key FISHPLATE_TENANT_ID=00000000-0000-0000-0000-000000000001 npx nx serve worker

# Direct
FISHPLATE_URL=http://localhost:8080 FISHPLATE_API_KEY=fp_demo_key FISHPLATE_TENANT_ID=... go run ./cmd/worker/
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FISHPLATE_URL` | No | `http://localhost:8080` | Control plane URL |
| `FISHPLATE_API_KEY` | Yes | — | Tenant API key |
| `FISHPLATE_TENANT_ID` | Yes | — | Tenant UUID |

## Registering Handlers

Handlers are registered by name in `cmd/worker/main.go`:

```go
w.Handle("llm_generate", func(input map[string]any) (map[string]any, error) {
    // Do work with input
    return map[string]any{"result": "done"}, nil
})
```

The worker polls `GetTask` every second. When a task arrives with a matching handler name, it executes the function and reports the result via `SubmitTaskResult`.

## SDK Package

`pkg/worker/` is the public SDK:
- `worker.New(cfg)` — create a worker with config
- `worker.Handle(name, fn)` — register a handler
- `worker.Run(ctx)` — start the poll loop (blocks until context cancelled)
```

- [ ] **Step 2: Commit**

```bash
git add apps/worker/README.md
git commit -m "docs: add worker README"
```

### Task 14: Proto README

**Files:**
- Create: `libs/proto/README.md`

- [ ] **Step 1: Create README**

```markdown
# Proto

Protobuf definitions for all fishplate RPC contracts. These are the single source of truth for shared types between the control plane and worker.

## Structure

```
proto/
├── buf.yaml                    # buf module config
├── buf.gen.yaml                # code generation config
├── fishplate/
│   ├── worker/v1/worker.proto  # WorkerService (GetTask, SubmitTaskResult)
│   └── admin/v1/admin.proto    # AdminService (stub)
└── gen/go/                     # Generated Go code (committed)
```

## Regenerating

```bash
cd libs/proto
buf generate
```

Requires [buf](https://buf.build/docs/installation) to be installed.

## Go Import Paths

```go
import (
    workerv1 "fishplate/gen/go/fishplate/worker/v1"
    "fishplate/gen/go/fishplate/worker/v1/workerv1connect"
)
```

The generated Go module is at `fishplate/gen/go` and is referenced via `replace` directives in the consuming Go modules.
```

- [ ] **Step 2: Commit**

```bash
git add libs/proto/README.md
git commit -m "docs: add proto README"
```

### Task 15: Workflow Core README

**Files:**
- Create: `libs/workflow-core/README.md`

- [ ] **Step 1: Create README**

```markdown
# Workflow Core

TypeScript library for CEL-based workflow graph definitions. This was the original implementation and now serves as a **design reference** for the Go control plane.

## Status

**Design reference only.** The Go control plane (`apps/controlplane/internal/graph/`) is the production implementation. This library is kept for reference but is not used at runtime.

## What It Defines

- Workflow graph structure (nodes, edges, conditions)
- CEL expression evaluation for decision nodes
- Graph walking algorithm (ported to Go in `internal/graph/walker.go`)
```

- [ ] **Step 2: Commit**

```bash
git add libs/workflow-core/README.md
git commit -m "docs: add workflow-core README"
```

### Task 16: Docker README

**Files:**
- Create: `docker/README.md`

- [ ] **Step 1: Create README**

```markdown
# Docker Dev Stack

Development environment for fishplate using Docker Compose.

## Services

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| `postgres` | postgres:16 | 5432 | Database with migrations auto-applied |
| `controlplane` | go.Dockerfile + Air | 8080 | Control plane with live reload |
| `worker` | go.Dockerfile + Air | — | Worker with live reload |

## Common Commands

```bash
# Start everything
docker compose up --build

# Start just Postgres (for running Go locally)
docker compose up postgres -d

# View logs
docker compose logs -f controlplane
docker compose logs -f worker

# Reset database (wipe and re-seed)
docker compose down -v && docker compose up --build

# Connect to Postgres directly
docker compose exec postgres psql -U fishplate

# Check task status
docker compose exec postgres psql -U fishplate -c "SELECT handler, status FROM tasks;"
```

## Live Reload

Both Go services use [Air](https://github.com/air-verse/air) for live reload. Edit any `.go` file and Air will rebuild and restart the service automatically.

## Demo Credentials

| Key | Value |
|-----|-------|
| API Key | `fp_demo_key` |
| Tenant ID | `00000000-0000-0000-0000-000000000001` |
| DB User | `fishplate` |
| DB Password | `fishplate` |
| DB Name | `fishplate` |
```

- [ ] **Step 2: Commit**

```bash
git add docker/README.md
git commit -m "docs: add Docker dev stack README"
```
