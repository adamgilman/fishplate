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
