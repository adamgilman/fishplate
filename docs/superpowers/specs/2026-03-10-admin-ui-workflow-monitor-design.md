# Admin UI — Workflow Monitor Design

## Goal

Build a single-page workflow visualization tool that renders a workflow definition as an interactive graph and overlays execution state. Mock data first, real API later.

## Scope

- **In scope:** Single workflow view with graph visualization, execution state overlay, node context inspector, dark mode, mock data
- **Out of scope:** Workflow builder/editor, execution list, workflow list, real API, authentication, multi-tenant, edge click/hover interactions (nodes only for inspector)

## Tech Stack

- React (Vite), React Flow, TanStack Query, ConnectRPC (future), shadcn/ui, Tailwind CSS, dagre (auto-layout)
- Nx app at `apps/admin-ui`
- Dark mode by default

## Architecture

Single-page React app. TanStack Query fetches workflow data (mock for now). The workflow graph is converted from `WorkflowGraph` model types to React Flow nodes/edges with dagre auto-layout. Execution state is overlaid as visual styling on nodes and edges.

### Data Flow

```
use-workflow.ts(executionId) returns { definition: WorkflowDefinition, execution: WorkflowExecutionView }
        ↓
graph-layout.ts extracts WorkflowGraph from definition, runs dagre → React Flow positioned nodes/edges
        ↓
merge execution state → styled nodes/edges on canvas
        ↓
click node → context-inspector panel
```

The hook takes an `executionId` string. In mock mode this is ignored and returns hardcoded data. Query key: `['workflow-execution', executionId]`.

`WorkflowDefinition` (from `workflow-core`) is the full persisted entity. The layout function extracts the `WorkflowGraph` subset (`entrypoint`, `nodes`, `edges`, `maxIterations`) for rendering. The definition's `name` and `version` are shown in the page header.

## Component Structure

```
apps/admin-ui/
  src/
    app.tsx                    — root with providers (TanStack Query, theme)
    routes/
      workflow-view.tsx        — the main page
    components/
      workflow-graph/
        workflow-graph.tsx     — React Flow canvas, converts WorkflowGraph → RF nodes/edges
        nodes/
          action-node.tsx      — rounded rectangle, handler name
          decision-node.tsx    — diamond shape, outgoing edge conditions
          fork-node.tsx        — parallel lines icon
          gate-node.tsx        — shield/pause icon
          terminal-node.tsx    — circle (start/end)
          workflow-node.tsx    — nested rectangle (child workflow)
      context-inspector/
        context-inspector.tsx  — side panel, shows input/output/context for selected node
      ui/                      — shadcn components
    hooks/
      use-workflow.ts          — TanStack Query hook, returns { definition, execution } from mock
    mocks/
      sample-workflow.ts       — SDLC workflow definition + execution state
    lib/
      graph-layout.ts          — WorkflowGraph → React Flow positioned nodes/edges via dagre
```

Note: execution state styling is applied by transforming node/edge data before passing to `<ReactFlow>`, not as a separate overlay component. Implementation decides the decomposition.

## Node Visual Treatment

| Node Type | Shape | Content | Data Source |
|-----------|-------|---------|-------------|
| action | Rounded rectangle | Handler name, status icon | `node.handler` |
| decision | Diamond | Lists outgoing edge conditions | `edges.filter(e => e.from === node.id).map(e => e.when)` |
| fork | Parallel lines | Branch count (e.g. "3 branches"), or nothing if `branches` is undefined | `node.branches?.length` |
| gate | Shield/pause | Timeout display (e.g. "timeout: 30s"), or "No timeout" | `node.timeoutMs` (no signal name field in model) |
| terminal | Circle | "Start" if `node.id === graph.entrypoint`, otherwise "End" | Compare against `WorkflowGraph.entrypoint`. Multiple terminal nodes are valid — all non-entrypoint terminals display as "End". |
| workflow | Nested rectangle | `workflowRef` value (this is a name/slug) | `node.workflowRef` |

## Execution State Overlay

| State | Visual |
|-------|--------|
| Completed | Green border |
| Running/current | Pulsing blue border |
| Failed | Red border |
| Waiting (gate awaiting signal) | Amber/yellow pulsing border |
| Pending (not reached) | Dim/gray |
| Taken path edges | Highlighted/colored |
| Untaken edges | Dim/dashed |

## Context Inspector

Side panel that shows details for the selected node:
- Node ID, type, handler (if applicable)
- CEL input expression (raw) — show `node.input` if present, otherwise "No input expression"
- Evaluated input (from execution node state, if available)
- Output/context updates (from execution node state, if available)
- Error message (if failed)
- For decision nodes: list of outgoing edge conditions with which was taken
- For fork nodes: list of branch IDs
- For workflow nodes: `workflowRef` and `workflowVersion`

## Mock Data

Sample SDLC workflow: generate → test → review (decision) → deploy or loop back. Execution state simulates being partway through (e.g., generate completed, test completed, review is current node).

The `use-workflow.ts` hook returns both the `WorkflowDefinition` and the `WorkflowExecutionView` as a single query result.

## Data Model for Execution State

These types are **frontend-only view models** defined in the admin-ui app (not added to `workflow-core`). They are derived from `WorkflowExecution` by the API layer (or mock). The future ConnectRPC API will map `WorkflowExecution` → `WorkflowExecutionView`.

```typescript
interface ExecutionNodeState {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting';
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

interface ExecutionEdgeState {
  from: string;
  to: string;
  when?: string;       // from EdgeDefinition.when — the CEL condition on this edge
  priority?: number;   // from EdgeDefinition.priority — used with `when` to uniquely identify an edge
  taken: boolean;
}

interface WorkflowExecutionView {
  executionId: string;
  definitionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting';
  currentNodeId?: string;
  context: Record<string, any>;
  params: Record<string, any>;
  error?: string;
  nodeStates: ExecutionNodeState[];
  edgeStates: ExecutionEdgeState[];
}
```

**Invariants:**
- `nodeStates` contains exactly one entry per node in the graph (latest state only). Unreached nodes are pre-populated with `status: 'pending'` — the data source (mock or API) is responsible for including them, not the frontend. In looping workflows, a node re-entered overwrites the previous entry.
- `edgeStates` contains one entry per edge in the graph, matched by `(from, to, when, priority)`. Untraversed edges are pre-populated with `taken: false`. An edge traversed multiple times in a loop is still a single entry with `taken: true`.

## Dependencies

- `reactflow` — graph canvas
- `@dagrejs/dagre` — automatic graph layout
- `@tanstack/react-query` — data fetching
- shadcn/ui — UI components (installed via CLI)
- `tailwindcss` — styling
- `lucide-react` — icons (comes with shadcn)

## Multi-Tenant Future

The app is built as a single-tenant view. To wrap for SaaS:
- Add tenant context provider
- TanStack Query hooks already abstract data fetching — swap mock for ConnectRPC client
- Add authentication/routing layer around the app

## Testing

- Component tests with Vitest + React Testing Library
- Mock data module is the test fixture
- `graph-layout.ts` is a pure function — unit test with sample `WorkflowGraph` inputs and assert React Flow node positions are assigned and edges reference valid node IDs
