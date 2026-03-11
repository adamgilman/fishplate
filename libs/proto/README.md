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
