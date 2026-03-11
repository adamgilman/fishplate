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
