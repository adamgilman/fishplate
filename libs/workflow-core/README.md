# Workflow Core

TypeScript library for CEL-based workflow graph definitions. This was the original implementation and now serves as a **design reference** for the Go control plane.

## Status

**Design reference only.** The Go control plane (`apps/controlplane/internal/graph/`) is the production implementation. This library is kept for reference but is not used at runtime.

## What It Defines

- Workflow graph structure (nodes, edges, conditions)
- CEL expression evaluation for decision nodes
- Graph walking algorithm (ported to Go in `internal/graph/walker.go`)
