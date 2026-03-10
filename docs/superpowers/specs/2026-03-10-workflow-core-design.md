# Workflow Core Design

## Overview

`@fishplate/workflow-core` is a pure library for defining, storing, validating, and traversing CEL-based workflow graphs. It has no DBOS dependency — the host application maps walker commands to DBOS durable primitives.

**Use case:** LLM SDLC-driven workflows — orchestrating LLM prompts through software development lifecycle tasks (code generation, review, testing, etc.) with conditional branching, loops, parallel execution, and approval gates.

**Workflow sources:** Built-in templates, tenant-authored, and LLM-generated. All go through the same validation pipeline.

## Data Model

### WorkflowDefinition

The TypeScript interfaces represent the in-memory model. The Postgres `workflow_definitions` table stores `name` and `version` as columns (for querying) and the graph payload (`entrypoint`, `nodes`, `edges`, `maxIterations`) in the `definition` JSONB column. The repository layer handles this split on read/write.

```typescript
interface WorkflowDefinition {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  isTemplate: boolean;             // true for built-in templates
  createdBy?: "system" | "user" | "llm";
  createdAt: Date;
  entrypoint: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  maxIterations?: number;          // global loop safety limit, default 100
}

// The JSONB payload stored in workflow_definitions.definition
interface WorkflowGraph {
  entrypoint: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  maxIterations?: number;
}

interface NodeDefinition {
  id: string;
  type: "action" | "decision" | "fork" | "gate" | "terminal" | "workflow";
  // action nodes
  handler?: string;                // opaque identifier resolved by host app
  input?: string;                  // CEL expression → builds input from context
  // workflow nodes (child workflow)
  workflowRef?: string;            // name of another workflow definition (same tenant)
  workflowVersion?: number;        // optional pinned version; if omitted, resolves to highest version number
  workflowInput?: string;          // CEL expression → input params for child
  // gate nodes
  timeoutMs?: number;
  timeoutEdge?: string;            // node ID to follow on timeout
  // fork nodes
  branches?: string[];             // node IDs — each is the entrypoint of a parallel branch
  joinNode?: string;               // node ID where all branches must complete before continuing
}

interface EdgeDefinition {
  from: string;
  to: string;
  when?: string;                   // CEL expression, evaluated against { ctx }
  priority?: number;               // for decision nodes, lower wins. default 0
  maxIterations?: number;          // per-edge loop limit override
}
```

**Fork semantics:** `branches` is a list of node IDs. Each branch ID is the starting node of an independent sub-path within the same graph. The walker follows each branch concurrently from its starting node until reaching `joinNode`. All branches must reach `joinNode` before the walker continues past it.

Fork context merging: each branch walker is initialized with a snapshot of the parent context. When a branch completes, the host computes the **delta** (keys added or changed relative to the initial snapshot) and returns only those as `contextUpdates`. Deltas are merged in branch declaration order (array order of `branches`), using last-write-wins for key conflicts. This prevents stale parent context values from overwriting concurrent updates.

If any branch fails, the fork fails — the host should cancel remaining in-flight branch workflows (e.g., via `DBOS.cancelWorkflow()`) and resolve the fork with `{ error }`. The walker then emits a `fail` command.

**Decision edge resolution:** Outgoing edges from a decision node are evaluated in priority order (lower first, default 0). Edges with equal priority are evaluated in array order (order they appear in `edges`). The first edge whose `when` expression evaluates to `true` is followed. An edge with no `when` clause acts as a default/fallback — it always matches. If no edges match, the walker emits a `fail` command.

**Non-decision node edge resolution:** All non-decision, non-terminal, non-fork, non-gate nodes must have exactly one outgoing edge. The `when` and `priority` fields on that edge are ignored — the walker always follows it. Graph validation enforces this constraint.

**Gate node edge resolution:** Gate nodes must have exactly one outgoing edge (the normal/approved path). The `timeoutEdge` field is an implicit edge — it is not represented in the `edges` array but is stored directly on the node definition. The walker uses the outgoing edge when the signal is received, and `timeoutEdge` when the gate times out. Graph validation ensures the `timeoutEdge` target node exists if specified.

### Execution Tracking

```typescript
interface WorkflowExecution {
  id: string;
  tenantId: string;
  definitionId: string;
  parentExecutionId?: string;      // child workflow link
  dbosWorkflowId?: string;
  status: "pending" | "running" | "completed" | "failed" | "waiting";
  currentNodeId?: string;
  context: Record<string, any>;
  params: Record<string, any>;
  error?: string;                  // set when status is "failed"
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

interface WorkflowResult {
  executionId: string;
  context: Record<string, any>;
  status: "completed" | "failed";
  error?: string;                  // set when status is "failed"
}
```

### Action Handler Interface

The host application implements this interface and registers handlers by name. The workflow engine references handlers by their string identifier.

```typescript
interface ActionHandler {
  execute(input: Record<string, any>): Promise<ActionResult>;
}

interface ActionResult {
  contextUpdates: Record<string, any>;
}
```

## CEL Usage

CEL is used in two places within the graph:

- **`node.input`** — evaluates to an object, passed as input to action/workflow handlers
- **`edge.when`** — evaluates to boolean, determines which edge to follow from decision nodes

All CEL expressions receive `{ ctx, _loop }` as variables:
- `ctx` — the current workflow context (accumulated from action results)
- `_loop` — a map of edge keys (`"fromNodeId->toNodeId"`) to their current iteration count. E.g., `_loop["review->generate"]` returns how many times that back-edge has been traversed. Edges not yet traversed are absent from the map. The counter is incremented **before** `edge.when` evaluation, so a CEL expression like `_loop["review->generate"] < 3` allows 3 total traversals (values 1, 2, 3 — the expression is false on the 4th attempt). The loop guard limit check also happens after incrementing.

CEL is sandboxed — no custom functions beyond what we explicitly register, no side effects.

**CEL runtime type errors:** If `edge.when` evaluates to a non-boolean, or `node.input` evaluates to a non-object, the walker emits a `fail` command with a descriptive reason (e.g., `"CEL expression on edge 'review->fix' returned string, expected boolean"`). CEL evaluation errors (undefined variables, type mismatches) are also treated as failures.

## Postgres Schema

```sql
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  definition  JSONB NOT NULL,        -- stores WorkflowGraph (entrypoint, nodes, edges, maxIterations)
  is_template BOOLEAN NOT NULL DEFAULT false,
  created_by  TEXT,                  -- 'system' | 'user' | 'llm'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name, version)
);

CREATE TABLE workflow_executions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  definition_id       UUID NOT NULL REFERENCES workflow_definitions(id),
  parent_execution_id UUID REFERENCES workflow_executions(id),
  dbos_workflow_id    TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'completed', 'failed', 'waiting')),
  current_node_id     TEXT,
  context             JSONB NOT NULL DEFAULT '{}',
  params              JSONB NOT NULL DEFAULT '{}',
  error               TEXT,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_definitions ON workflow_definitions
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation_executions ON workflow_executions
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

## Graph Walker (Command Pattern)

The walker is a pure, stateful iterator. It traverses the graph and yields commands for the host to execute. Decision nodes and CEL evaluation happen internally — the host only sees actionable commands. A single `next()` call may internally traverse multiple nodes (e.g., a chain of decision nodes) before yielding a command that requires host action. The walker only yields for nodes that need external execution (action, workflow, fork, gate) or terminal states (complete, fail).

```typescript
type WalkerCommand =
  | { type: "execute_action"; nodeId: string; handler: string; input: Record<string, any> }
  | { type: "execute_workflow"; nodeId: string; workflowRef: string; workflowVersion?: number; input: Record<string, any> }
  | { type: "fork"; nodeId: string; branches: string[]; joinNode: string }
  | { type: "wait_for_signal"; nodeId: string; timeoutMs?: number }
  | { type: "complete"; context: Record<string, any> }
  | { type: "fail"; nodeId: string; reason: string };

type CommandResult = {
  contextUpdates?: Record<string, any>;
  signalReceived?: boolean;        // for gate nodes: true if signal received, false if timed out
  error?: string;                  // set when a child workflow or action failed
};

class GraphWalker {
  constructor(definition: WorkflowDefinition, params: Record<string, any>);

  // Walk from a specific start node to a stop node (used for fork branches).
  // If not called, walks from definition.entrypoint to terminal.
  setBounds(startNodeId: string, stopNodeId: string): void;

  next(): WalkerCommand;
  resolve(result: CommandResult): void;
  getContext(): Record<string, any>;   // returns current accumulated context (snapshot)
}
```

**Gate timeout handling:** The walker emits `wait_for_signal` with `nodeId` and `timeoutMs`. The `nodeId` doubles as the gate identifier for signaling (e.g., `DBOS.recv("gate:<nodeId>")`). Gate signals carry a boolean payload — only `true` means approve/proceed. The host checks `value === true` and resolves with `{ signalReceived: true }`. Any other value (`false`, `null`, timeout) resolves as `{ signalReceived: false }`. The walker internally handles edge routing: it follows the normal outgoing edge when `signalReceived: true`, and `timeoutEdge` (from the node definition) when `signalReceived: false`. The host does not need to know about `timeoutEdge` — it is the walker's responsibility. If `timeoutEdge` is not defined and `signalReceived` is `false`, the walker emits a `fail` command. To model richer gate outcomes (approve/reject/escalate), use a gate followed by a decision node that branches on context values set by the host in `contextUpdates`.

**Error propagation:** When the host resolves with `{ error: "..." }`, the walker emits a `fail` command on the next `next()` call. This is how child workflow and action failures propagate.

**Walker state and durability:** The walker itself is not durable — it is a lightweight in-memory object. DBOS provides the durability guarantee: if the host process crashes, DBOS replays the workflow from its journal, re-executing the walker loop from the beginning. Each `DBOS.runStep()` call is journaled, so replayed steps return their previous results without re-executing. The walker is deterministic (same definition + same sequence of `resolve()` calls = same commands), so replay produces the same walker state. No separate walker serialization is needed.

**Context and params:** `params` are the initial input to the workflow and are stored immutably on the execution record. The walker initializes its internal context as a copy of `params` (`ctx = { ...params }`). As the workflow progresses, `contextUpdates` from resolved commands are merged into `ctx`. CEL expressions access the accumulated state via `ctx` — they do not access `params` directly. The `context` field on `WorkflowExecution` reflects the walker's current `ctx` at each node transition.

**Fork branch loop counters:** Each fork branch runs its own `GraphWalker` instance (via `setBounds`), which maintains its own independent `_loop` map. Branch `_loop` state is not merged back into the parent — only `contextUpdates` from branch results are merged.

**`setBounds` behavior:** When `setBounds(startNodeId, stopNodeId)` is called, the walker begins at `startNodeId` and emits a `complete` command when it reaches `stopNodeId` — without executing the stop node. This allows the parent walker to continue from `joinNode` after all branches complete.

**`WorkflowResult` construction:** The host is responsible for constructing `WorkflowResult` from the walker's terminal command. When the walker emits `{ type: "complete", context }`, the host builds `{ executionId, context, status: "completed" }`. When it emits `{ type: "fail", nodeId, reason }`, the host builds `{ executionId, context: walker.getContext(), status: "failed", error: reason }`. The host also persists this to the `workflow_executions` table.

### Host Integration Example (DBOS)

```typescript
const walker = new GraphWalker(definition, params);

let cmd = walker.next();
while (cmd.type !== "complete" && cmd.type !== "fail") {
  switch (cmd.type) {
    case "execute_action": {
      const actionResult: ActionResult = await DBOS.runStep(async () => {
        return handlers.get(cmd.handler).execute(cmd.input);
      }, { name: `step:${cmd.nodeId}` });
      walker.resolve({ contextUpdates: actionResult.contextUpdates });
      break;
    }
    case "wait_for_signal": {
      // Gate signals are boolean: true = approve, false/null = reject/timeout
      const value = await DBOS.recv<boolean>(`gate:${cmd.nodeId}`, cmd.timeoutMs);
      if (value === true) {
        walker.resolve({ signalReceived: true });
      } else {
        // value is false (explicit rejection), null (timeout), or undefined
        walker.resolve({ signalReceived: false });
      }
      break;
    }
    case "fork": {
      // Snapshot parent context before forking
      const parentSnapshot = { ...walker.getContext() };
      // Each branch gets its own GraphWalker with setBounds(branchStart, joinNode)
      const handles = await Promise.all(
        cmd.branches.map(branchId =>
          DBOS.startWorkflow(executeBranch)({
            definition, startNodeId: branchId, stopNodeId: cmd.joinNode, params: parentSnapshot
          })
        )
      );
      const settled = await Promise.allSettled(handles.map(h => h.getResult()));
      const failed = settled.find(s => s.status === "rejected" || (s.status === "fulfilled" && s.value.status === "failed"));
      if (failed) {
        for (const h of handles) { try { await h.cancel(); } catch {} }
        const err = failed.status === "fulfilled" ? failed.value.error : String(failed.reason);
        walker.resolve({ error: err ?? "Fork branch failed" });
      } else {
        // Compute delta per branch: only keys that changed relative to parentSnapshot
        const merged: Record<string, any> = {};
        const results = settled.map(s => (s as PromiseFulfilledResult<WorkflowResult>).value);
        for (const r of results) {
          for (const [k, v] of Object.entries(r.context)) {
            if (JSON.stringify(v) !== JSON.stringify(parentSnapshot[k])) merged[k] = v;
          }
        }
        walker.resolve({ contextUpdates: merged });
      }
      break;
    }
    case "execute_workflow": {
      // Host resolves workflowRef (name) + optional version to a definition via repository
      const childDef = await repo.getByName(tenantId, cmd.workflowRef, cmd.workflowVersion);
      const handle = await DBOS.startWorkflow(executeGraph)({
        definition: childDef, params: cmd.input
      });
      const childResult: WorkflowResult = await handle.getResult();
      if (childResult.status === "failed") {
        walker.resolve({ error: childResult.error });
      } else {
        // Compute delta: only keys changed relative to what was passed as input
        const delta: Record<string, any> = {};
        for (const [k, v] of Object.entries(childResult.context)) {
          if (JSON.stringify(v) !== JSON.stringify(cmd.input[k])) delta[k] = v;
        }
        walker.resolve({ contextUpdates: delta });
      }
      break;
    }
  }
  cmd = walker.next();
}
```

## Library Structure

```
libs/
  workflow-core/
    src/
      index.ts                    # public API exports
      models/
        definition.ts             # WorkflowDefinition, WorkflowGraph, NodeDefinition, EdgeDefinition
        execution.ts              # WorkflowExecution, WorkflowResult
        handler.ts                # ActionHandler, ActionResult
      cel/
        evaluator.ts              # CEL evaluation wrapper (sandboxed)
        validator.ts              # validate CEL expressions parse
      graph/
        walker.ts                 # graph traversal, yields WalkerCommands
        loop-guard.ts             # back-edge iteration tracking
        validator.ts              # graph integrity checks
      storage/
        repository.ts             # Postgres queries for definitions + executions
        migrations/
          001_initial.sql
      validation/
        schema.ts                 # JSON structure validation
    package.json
    tsconfig.json
    tsconfig.spec.json
```

## Validation (Three Layers)

All definitions — built-in, tenant-authored, LLM-generated — pass through the same pipeline at storage time:

1. **Schema validation** — JSON structure correctness (required fields, types, valid enums). JSON Schema based. Enforces required fields per node type:
   - `action` nodes must have `handler`
   - `workflow` nodes must have `workflowRef`
   - `fork` nodes must have `branches` and `joinNode`
   - `gate` nodes may optionally have `timeoutMs` and `timeoutEdge`
   - `decision` and `terminal` nodes have no required extra fields

2. **Graph validation** — Structural integrity:
   - Entrypoint exists
   - No orphan nodes (all reachable from entrypoint)
   - No dangling edges
   - Terminal nodes have no outgoing edges
   - Fork node `branches` entries all exist in the graph and are distinct from each other
   - Fork nodes have a `joinNode` that exists in the graph and is reachable from all branch entrypoints
   - Decision nodes have at least one outgoing edge
   - Gate nodes have exactly one outgoing edge; `timeoutEdge` target exists if specified
   - Non-terminal, non-decision, non-fork, non-gate nodes have exactly one outgoing edge

3. **CEL validation** — All CEL expressions parse without errors. Does not validate runtime variable availability (inherently dynamic).

## Runtime Safety

- **Loop guard** — per-edge iteration counters. An edge's `maxIterations` overrides the global `WorkflowDefinition.maxIterations` (default 100). If an edge has no `maxIterations`, the global limit applies. Back-edges exceeding their limit emit a `fail` command.
- **CEL sandbox** — no side effects, no custom functions beyond explicitly registered ones.
- **Workflow context** — `_loop` map available in CEL, keyed by edge (`"fromId->toId"`), values are iteration counts.
- **Child/fork failure propagation** — failed child workflows and fork branches cause the parent walker to emit a `fail` command.

## Key Design Decisions

- **CEL-as-Config (Approach A)** — Graph is JSON, CEL handles expressions only. Simplest, most LLM-friendly, easiest to validate.
- **Pure library, no DBOS dependency** — host maps walker commands to DBOS. Testable without infrastructure.
- **Cycles allowed** — back-edges with iteration limits enable looping workflows (e.g., implement → test → loop until coverage > 80%).
- **Shared Postgres, row-level security** — tenant isolation via `app.tenant_id` session variable.
- **Versioned definitions** — editing creates new version, running instances use their original.
- **No ORM** — raw SQL queries, DBOS-compatible.
- **JSONB storage split** — `name`/`version`/`is_template`/`created_by` as columns for querying, graph payload (`entrypoint`, `nodes`, `edges`, `maxIterations`) in JSONB. Repository layer handles the split.
