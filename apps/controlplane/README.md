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
