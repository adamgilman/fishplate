# Admin UI — Workflow Monitor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page React app that visualizes a workflow definition as an interactive graph with execution state overlay.

**Architecture:** Vite+React app in Nx monorepo at `apps/admin-ui`. React Flow renders workflow graphs with dagre auto-layout. TanStack Query provides data fetching (mock for now). shadcn/ui + Tailwind for dark-mode UI. Custom node components for each workflow node type.

**Tech Stack:** React, Vite, React Flow, dagre, TanStack Query, shadcn/ui, Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-10-admin-ui-workflow-monitor-design.md`

---

## Chunk 1: Project Scaffolding

### Task 1: Scaffold the Vite+React Nx app

**Files:**
- Create: `apps/admin-ui/package.json`
- Create: `apps/admin-ui/project.json`
- Create: `apps/admin-ui/index.html`
- Create: `apps/admin-ui/vite.config.ts`
- Create: `apps/admin-ui/tsconfig.json`
- Create: `apps/admin-ui/tsconfig.app.json`
- Create: `apps/admin-ui/tsconfig.spec.json`
- Create: `apps/admin-ui/src/main.tsx`
- Create: `apps/admin-ui/src/app.tsx`

- [ ] **Step 1: Create project.json**

```json
{
  "name": "admin-ui",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/admin-ui/src",
  "projectType": "application",
  "targets": {
    "dev": {
      "executor": "nx:run-commands",
      "options": {
        "command": "npx vite",
        "cwd": "apps/admin-ui"
      }
    },
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "npx vite build",
        "cwd": "apps/admin-ui"
      },
      "dependsOn": ["^build"]
    },
    "test": {
      "executor": "nx:run-commands",
      "options": {
        "command": "npx vitest run",
        "cwd": "apps/admin-ui"
      }
    }
  }
}
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "@fishplate/admin-ui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@xyflow/react": "^12.0.0",
    "@dagrejs/dagre": "^1.1.0",
    "@tanstack/react-query": "^5.0.0",
    "lucide-react": "^0.400.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0",
    "class-variance-authority": "^0.7.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "~5.7.0",
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vite-tsconfig-paths": "^5.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 3: Create index.html**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fishplate — Workflow Monitor</title>
  </head>
  <body class="bg-zinc-950 text-zinc-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  optimizeDeps: {
    include: ['@dagrejs/dagre'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    deps: {
      optimizer: {
        web: {
          include: ['@dagrejs/dagre'],
        },
      },
    },
  },
});
```

- [ ] **Step 5: Create tsconfig files**

`apps/admin-ui/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"],
      "@fishplate/workflow-core": ["../../libs/workflow-core/src/index.ts"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.spec.json" }
  ]
}
```

`apps/admin-ui/tsconfig.app.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": []
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/**/*.spec.ts", "src/**/*.spec.tsx"]
}
```

`apps/admin-ui/tsconfig.spec.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.spec.ts", "src/**/*.spec.tsx"]
}
```

- [ ] **Step 6: Create src/main.tsx and src/app.tsx**

`apps/admin-ui/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`apps/admin-ui/src/app.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <h1 className="p-4 text-xl font-semibold">Fishplate — Workflow Monitor</h1>
      </div>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 7: Create src/app.css**

`apps/admin-ui/src/app.css`:
```css
@import "tailwindcss";
```

Note: `app.css` is imported once in `main.tsx`. Do NOT add a second import in `app.tsx` later.

- [ ] **Step 8: Create test setup**

`apps/admin-ui/src/test-setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 9: Create utility for shadcn cn() function**

`apps/admin-ui/src/lib/utils.ts`:
```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 10: Install dependencies**

Run: `cd /home/agilman/fishplate && yarn install`
Expected: all packages install successfully

- [ ] **Step 11: Verify the app starts**

Run: `cd apps/admin-ui && npx vite build`
Expected: builds without errors

- [ ] **Step 12: Verify Nx sees the project**

Run: `./nx show project admin-ui`
Expected: shows project config with dev, build, test targets

- [ ] **Step 13: Commit**

```bash
git add apps/admin-ui/ package.json yarn.lock
git commit -m "chore: scaffold admin-ui Vite+React app with Tailwind and TanStack Query"
```

---

## Chunk 2: View Models + Mock Data + Graph Layout

### Task 2: Define view model types

**Files:**
- Create: `apps/admin-ui/src/types/execution-view.ts`

- [ ] **Step 1: Create execution view types**

```typescript
export interface ExecutionNodeState {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting';
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ExecutionEdgeState {
  from: string;
  to: string;
  when?: string;
  priority?: number;
  taken: boolean;
}

export interface WorkflowExecutionView {
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

- [ ] **Step 2: Commit**

```bash
git add apps/admin-ui/src/types/
git commit -m "feat(admin-ui): add execution view model types"
```

---

### Task 3: Create mock data

**Files:**
- Create: `apps/admin-ui/src/mocks/sample-workflow.ts`

- [ ] **Step 1: Write sample SDLC workflow and execution state**

```typescript
import type { WorkflowDefinition } from '@fishplate/workflow-core';
import type { WorkflowExecutionView } from '../types/execution-view';

export const sampleDefinition: WorkflowDefinition = {
  id: 'def-001',
  tenantId: 'tenant-local',
  name: 'sdlc-pipeline',
  version: 1,
  isTemplate: false,
  createdAt: new Date('2026-03-10'),
  entrypoint: 'start',
  nodes: [
    { id: 'start', type: 'terminal' },
    { id: 'generate', type: 'action', handler: 'llm_generate', input: '{"task": ctx.task, "model": "claude-sonnet-4-6"}' },
    { id: 'test', type: 'action', handler: 'run_tests', input: '{"code": ctx.generated_code}' },
    { id: 'review', type: 'decision' },
    { id: 'deploy', type: 'action', handler: 'deploy_service', input: '{"code": ctx.generated_code, "env": "staging"}' },
    { id: 'done', type: 'terminal' },
    { id: 'failed', type: 'terminal' },
  ],
  edges: [
    { from: 'start', to: 'generate' },
    { from: 'generate', to: 'test' },
    { from: 'test', to: 'review' },
    { from: 'review', to: 'deploy', when: 'ctx.tests_passing == true && ctx.coverage > 80', priority: 0 },
    { from: 'review', to: 'generate', when: 'ctx.tests_passing == false || ctx.coverage <= 80', priority: 1, maxIterations: 3 },
    { from: 'review', to: 'failed', priority: 2 },
    { from: 'deploy', to: 'done' },
  ],
};

export const sampleExecution: WorkflowExecutionView = {
  executionId: 'exec-001',
  definitionId: 'def-001',
  status: 'running',
  currentNodeId: 'review',
  context: {
    task: 'Build a REST API for user management',
    generated_code: 'export function createUser(data: UserInput) { ... }',
    tests_passing: true,
    coverage: 65,
  },
  params: {
    task: 'Build a REST API for user management',
  },
  nodeStates: [
    {
      nodeId: 'start',
      status: 'completed',
      startedAt: new Date('2026-03-10T10:00:00Z'),
      completedAt: new Date('2026-03-10T10:00:00Z'),
    },
    {
      nodeId: 'generate',
      status: 'completed',
      input: { task: 'Build a REST API for user management', model: 'claude-sonnet-4-6' },
      output: { generated_code: 'export function createUser(data: UserInput) { ... }' },
      startedAt: new Date('2026-03-10T10:00:00Z'),
      completedAt: new Date('2026-03-10T10:00:15Z'),
    },
    {
      nodeId: 'test',
      status: 'completed',
      input: { code: 'export function createUser(data: UserInput) { ... }' },
      output: { tests_passing: true, coverage: 65 },
      startedAt: new Date('2026-03-10T10:00:15Z'),
      completedAt: new Date('2026-03-10T10:00:30Z'),
    },
    {
      nodeId: 'review',
      status: 'running',
      startedAt: new Date('2026-03-10T10:00:30Z'),
    },
    { nodeId: 'deploy', status: 'pending' },
    { nodeId: 'done', status: 'pending' },
    { nodeId: 'failed', status: 'pending' },
  ],
  edgeStates: [
    { from: 'start', to: 'generate', taken: true },
    { from: 'generate', to: 'test', taken: true },
    { from: 'test', to: 'review', taken: true },
    { from: 'review', to: 'deploy', when: 'ctx.tests_passing == true && ctx.coverage > 80', priority: 0, taken: false },
    { from: 'review', to: 'generate', when: 'ctx.tests_passing == false || ctx.coverage <= 80', priority: 1, taken: false },
    { from: 'review', to: 'failed', priority: 2, taken: false },
    { from: 'deploy', to: 'done', taken: false },
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin-ui/src/mocks/
git commit -m "feat(admin-ui): add sample SDLC workflow mock data"
```

---

### Task 4: Graph layout function

**Files:**
- Create: `apps/admin-ui/src/lib/graph-layout.ts`
- Test: `apps/admin-ui/src/lib/graph-layout.spec.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { layoutWorkflowGraph } from './graph-layout';
import type { WorkflowDefinition } from '@fishplate/workflow-core';
import type { WorkflowExecutionView, ExecutionNodeState, ExecutionEdgeState } from '../types/execution-view';

const definition: WorkflowDefinition = {
  id: 'def-1',
  tenantId: 't1',
  name: 'test',
  version: 1,
  isTemplate: false,
  createdAt: new Date(),
  entrypoint: 'a',
  nodes: [
    { id: 'a', type: 'action', handler: 'h1' },
    { id: 'b', type: 'decision' },
    { id: 'c', type: 'terminal' },
  ],
  edges: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c', when: 'ctx.x > 0' },
  ],
};

const execution: WorkflowExecutionView = {
  executionId: 'e1',
  definitionId: 'def-1',
  status: 'running',
  currentNodeId: 'b',
  context: {},
  params: {},
  nodeStates: [
    { nodeId: 'a', status: 'completed' },
    { nodeId: 'b', status: 'running' },
    { nodeId: 'c', status: 'pending' },
  ],
  edgeStates: [
    { from: 'a', to: 'b', taken: true },
    { from: 'b', to: 'c', when: 'ctx.x > 0', taken: false },
  ],
};

describe('layoutWorkflowGraph', () => {
  it('returns nodes with positions for every definition node', () => {
    const result = layoutWorkflowGraph(definition, execution);
    expect(result.nodes).toHaveLength(3);
    for (const node of result.nodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
    }
  });

  it('assigns correct node types', () => {
    const result = layoutWorkflowGraph(definition, execution);
    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));
    expect(nodeMap.get('a')!.type).toBe('action');
    expect(nodeMap.get('b')!.type).toBe('decision');
    expect(nodeMap.get('c')!.type).toBe('terminal');
  });

  it('passes node data including definition and execution state', () => {
    const result = layoutWorkflowGraph(definition, execution);
    const nodeA = result.nodes.find(n => n.id === 'a')!;
    expect(nodeA.data.definition).toBeDefined();
    expect(nodeA.data.definition.handler).toBe('h1');
    expect(nodeA.data.executionState).toBeDefined();
    expect(nodeA.data.executionState.status).toBe('completed');
    expect(nodeA.data.isEntrypoint).toBe(true);
  });

  it('returns edges for every definition edge', () => {
    const result = layoutWorkflowGraph(definition, execution);
    expect(result.edges).toHaveLength(2);
  });

  it('marks taken edges with animated style', () => {
    const result = layoutWorkflowGraph(definition, execution);
    const takenEdge = result.edges.find(e => e.source === 'a' && e.target === 'b')!;
    const untakenEdge = result.edges.find(e => e.source === 'b' && e.target === 'c')!;
    expect(takenEdge.data.taken).toBe(true);
    expect(untakenEdge.data.taken).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/admin-ui && npx vitest run src/lib/graph-layout.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write graph-layout.ts**

```typescript
import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { WorkflowDefinition, NodeDefinition, EdgeDefinition } from '@fishplate/workflow-core';
import type { WorkflowExecutionView, ExecutionNodeState, ExecutionEdgeState } from '../types/execution-view';

export interface WorkflowNodeData {
  definition: NodeDefinition;
  executionState: ExecutionNodeState;
  isEntrypoint: boolean;
  edges: EdgeDefinition[];
  edgeStates: ExecutionEdgeState[];
}

export interface WorkflowEdgeData {
  taken: boolean;
  when?: string;
  priority?: number;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;

export function layoutWorkflowGraph(
  definition: WorkflowDefinition,
  execution: WorkflowExecutionView,
): { nodes: Node<WorkflowNodeData>[]; edges: Edge<WorkflowEdgeData>[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });

  const nodeStateMap = new Map(execution.nodeStates.map(ns => [ns.nodeId, ns]));

  for (const node of definition.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of definition.edges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  const nodes: Node<WorkflowNodeData>[] = definition.nodes.map(node => {
    const pos = g.node(node.id);
    const outgoingEdges = definition.edges.filter(e => e.from === node.id);
    const outgoingEdgeStates = execution.edgeStates.filter(e => e.from === node.id);

    return {
      id: node.id,
      type: node.type,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        definition: node,
        executionState: nodeStateMap.get(node.id) ?? { nodeId: node.id, status: 'pending' as const },
        isEntrypoint: node.id === definition.entrypoint,
        edges: outgoingEdges,
        edgeStates: outgoingEdgeStates,
      },
    };
  });

  const edgeStateMap = new Map(
    execution.edgeStates.map(es => [`${es.from}->${es.to}:${es.when ?? ''}:${es.priority ?? ''}`, es])
  );

  const edges: Edge<WorkflowEdgeData>[] = definition.edges.map((edge, i) => {
    const key = `${edge.from}->${edge.to}:${edge.when ?? ''}:${edge.priority ?? ''}`;
    const edgeState = edgeStateMap.get(key);

    return {
      id: `e-${edge.from}-${edge.to}-${i}`,
      source: edge.from,
      target: edge.to,
      data: {
        taken: edgeState?.taken ?? false,
        when: edge.when,
        priority: edge.priority,
      },
    };
  });

  return { nodes, edges };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/admin-ui && npx vitest run src/lib/graph-layout.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-ui/src/lib/ apps/admin-ui/src/types/
git commit -m "feat(admin-ui): add graph layout function with dagre auto-positioning"
```

---

## Chunk 3: Custom Node Components

### Task 5: Create custom React Flow node components

**Files:**
- Create: `apps/admin-ui/src/components/workflow-graph/nodes/base-node.tsx`
- Create: `apps/admin-ui/src/components/workflow-graph/nodes/action-node.tsx`
- Create: `apps/admin-ui/src/components/workflow-graph/nodes/decision-node.tsx`
- Create: `apps/admin-ui/src/components/workflow-graph/nodes/fork-node.tsx`
- Create: `apps/admin-ui/src/components/workflow-graph/nodes/gate-node.tsx`
- Create: `apps/admin-ui/src/components/workflow-graph/nodes/terminal-node.tsx`
- Create: `apps/admin-ui/src/components/workflow-graph/nodes/workflow-node.tsx`
- Create: `apps/admin-ui/src/components/workflow-graph/nodes/index.ts`

- [ ] **Step 1: Create base-node.tsx with shared status styling**

```tsx
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { WorkflowNodeData } from '@/lib/graph-layout';

const statusStyles: Record<string, string> = {
  completed: 'border-emerald-500 bg-emerald-500/10',
  running: 'border-blue-500 bg-blue-500/10 animate-pulse',
  failed: 'border-red-500 bg-red-500/10',
  waiting: 'border-amber-500 bg-amber-500/10 animate-pulse',
  pending: 'border-zinc-700 bg-zinc-800/50 opacity-50',
};

interface BaseNodeProps {
  data: WorkflowNodeData;
  children: React.ReactNode;
  className?: string;
  shape?: 'rounded' | 'diamond' | 'circle';
}

export function BaseNode({ data, children, className, shape = 'rounded' }: BaseNodeProps) {
  const status = data.executionState.status;
  const shapeClass = {
    rounded: 'rounded-lg',
    diamond: 'rounded-lg rotate-45',
    circle: 'rounded-full',
  }[shape];

  return (
    <div
      className={cn(
        'border-2 px-4 py-3 min-w-[200px] text-center',
        shapeClass,
        statusStyles[status],
        className,
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-500" />
      {children}
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-500" />
    </div>
  );
}
```

- [ ] **Step 2: Create action-node.tsx**

```tsx
import { Play } from 'lucide-react';
import { BaseNode } from './base-node';
import type { NodeProps, Node } from '@xyflow/react';
import type { WorkflowNodeData } from '@/lib/graph-layout';

export function ActionNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  return (
    <BaseNode data={data}>
      <div className="flex items-center gap-2 justify-center">
        <Play className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200">{data.definition.handler}</span>
      </div>
      <div className="text-xs text-zinc-500 mt-1">{data.definition.id}</div>
    </BaseNode>
  );
}
```

- [ ] **Step 3: Create decision-node.tsx**

```tsx
import { GitBranch } from 'lucide-react';
import { BaseNode } from './base-node';
import type { NodeProps, Node } from '@xyflow/react';
import type { WorkflowNodeData } from '@/lib/graph-layout';

export function DecisionNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  const conditions = data.edges
    .filter(e => e.when)
    .map(e => e.when!);

  return (
    <BaseNode data={data} shape="diamond" className="bg-zinc-900/80">
      <div className="-rotate-45">
        <div className="flex items-center gap-2 justify-center">
          <GitBranch className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">Decision</span>
        </div>
        {conditions.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {conditions.map((c, i) => (
              <div key={i} className="text-xs text-zinc-500 font-mono truncate max-w-[180px]">{c}</div>
            ))}
          </div>
        )}
        <div className="text-xs text-zinc-500 mt-1">{data.definition.id}</div>
      </div>
    </BaseNode>
  );
}
```

- [ ] **Step 4: Create fork-node.tsx**

```tsx
import { Columns3 } from 'lucide-react';
import { BaseNode } from './base-node';
import type { NodeProps, Node } from '@xyflow/react';
import type { WorkflowNodeData } from '@/lib/graph-layout';

export function ForkNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  const branchCount = data.definition.branches?.length;

  return (
    <BaseNode data={data}>
      <div className="flex items-center gap-2 justify-center">
        <Columns3 className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200">Fork</span>
      </div>
      {branchCount !== undefined && (
        <div className="text-xs text-zinc-500 mt-1">{branchCount} branches</div>
      )}
      <div className="text-xs text-zinc-500 mt-1">{data.definition.id}</div>
    </BaseNode>
  );
}
```

- [ ] **Step 5: Create gate-node.tsx**

```tsx
import { ShieldHalf } from 'lucide-react';
import { BaseNode } from './base-node';
import type { NodeProps, Node } from '@xyflow/react';
import type { WorkflowNodeData } from '@/lib/graph-layout';

export function GateNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  const timeoutMs = data.definition.timeoutMs;
  const timeoutDisplay = timeoutMs
    ? `timeout: ${(timeoutMs / 1000).toFixed(0)}s`
    : 'No timeout';

  return (
    <BaseNode data={data}>
      <div className="flex items-center gap-2 justify-center">
        <ShieldHalf className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200">Gate</span>
      </div>
      <div className="text-xs text-zinc-500 mt-1">{timeoutDisplay}</div>
      <div className="text-xs text-zinc-500 mt-1">{data.definition.id}</div>
    </BaseNode>
  );
}
```

- [ ] **Step 6: Create terminal-node.tsx**

```tsx
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { NodeProps, Node } from '@xyflow/react';
import type { WorkflowNodeData } from '@/lib/graph-layout';

const statusStyles: Record<string, string> = {
  completed: 'border-emerald-500 bg-emerald-500/10',
  running: 'border-blue-500 bg-blue-500/10 animate-pulse',
  failed: 'border-red-500 bg-red-500/10',
  waiting: 'border-amber-500 bg-amber-500/10 animate-pulse',
  pending: 'border-zinc-700 bg-zinc-800/50 opacity-50',
};

export function TerminalNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  const isStart = data.isEntrypoint;
  const status = data.executionState.status;
  const label = isStart ? 'Start' : 'End';

  return (
    <div
      className={cn(
        'border-2 rounded-full w-16 h-16 flex flex-col items-center justify-center',
        statusStyles[status],
      )}
    >
      {isStart ? (
        <Handle type="source" position={Position.Bottom} className="!bg-zinc-500" />
      ) : (
        <Handle type="target" position={Position.Top} className="!bg-zinc-500" />
      )}
      <span className={cn('text-xs font-semibold', isStart ? 'text-emerald-400' : 'text-zinc-400')}>
        {label}
      </span>
    </div>
  );
}
```

- [ ] **Step 7: Create workflow-node.tsx**

```tsx
import { Workflow } from 'lucide-react';
import { BaseNode } from './base-node';
import type { NodeProps, Node } from '@xyflow/react';
import type { WorkflowNodeData } from '@/lib/graph-layout';

export function WorkflowNode({ data }: NodeProps<Node<WorkflowNodeData>>) {
  return (
    <BaseNode data={data} className="border-dashed">
      <div className="flex items-center gap-2 justify-center">
        <Workflow className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200">{data.definition.workflowRef}</span>
      </div>
      {data.definition.workflowVersion && (
        <div className="text-xs text-zinc-500 mt-1">v{data.definition.workflowVersion}</div>
      )}
      <div className="text-xs text-zinc-500 mt-1">{data.definition.id}</div>
    </BaseNode>
  );
}
```

- [ ] **Step 8: Create nodes/index.ts**

```typescript
export { ActionNode } from './action-node';
export { DecisionNode } from './decision-node';
export { ForkNode } from './fork-node';
export { GateNode } from './gate-node';
export { TerminalNode } from './terminal-node';
export { WorkflowNode } from './workflow-node';
```

- [ ] **Step 9: Commit**

```bash
git add apps/admin-ui/src/components/
git commit -m "feat(admin-ui): add custom React Flow node components for all workflow node types"
```

### Task 6: Component tests for node components

**Files:**
- Test: `apps/admin-ui/src/components/workflow-graph/nodes/nodes.spec.tsx`

- [ ] **Step 1: Write node component tests**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ActionNode } from './action-node';
import { DecisionNode } from './decision-node';
import { TerminalNode } from './terminal-node';
import type { WorkflowNodeData } from '@/lib/graph-layout';

function makeNodeData(overrides: Partial<WorkflowNodeData> = {}): WorkflowNodeData {
  return {
    definition: { id: 'test-node', type: 'action', handler: 'my_handler' },
    executionState: { nodeId: 'test-node', status: 'completed' },
    isEntrypoint: false,
    edges: [],
    edgeStates: [],
    ...overrides,
  };
}

function renderInFlow(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}

// Cast helper to avoid passing all required NodeProps fields (zIndex, selected, etc.)
function nodeProps(id: string, data: WorkflowNodeData, type: string) {
  return { id, data, type } as any;
}

describe('ActionNode', () => {
  it('renders handler name', () => {
    renderInFlow(<ActionNode {...nodeProps('test', makeNodeData(), 'action')} />);
    expect(screen.getByText('my_handler')).toBeInTheDocument();
  });
});

describe('TerminalNode', () => {
  it('renders "Start" when isEntrypoint is true', () => {
    const data = makeNodeData({ isEntrypoint: true, definition: { id: 'start', type: 'terminal' } });
    renderInFlow(<TerminalNode {...nodeProps('start', data, 'terminal')} />);
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('renders "End" when isEntrypoint is false', () => {
    const data = makeNodeData({ isEntrypoint: false, definition: { id: 'end', type: 'terminal' } });
    renderInFlow(<TerminalNode {...nodeProps('end', data, 'terminal')} />);
    expect(screen.getByText('End')).toBeInTheDocument();
  });
});

describe('DecisionNode', () => {
  it('renders condition text from edges', () => {
    const data = makeNodeData({
      definition: { id: 'review', type: 'decision' },
      edges: [{ from: 'review', to: 'deploy', when: 'ctx.ok == true' }],
    });
    renderInFlow(<DecisionNode {...nodeProps('review', data, 'decision')} />);
    expect(screen.getByText('ctx.ok == true')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/admin-ui && npx vitest run src/components/workflow-graph/nodes/nodes.spec.tsx`
Expected: FAIL — components not yet created (or pass if created in Task 5)

- [ ] **Step 3: Run tests after Task 5 implementation**

Run: `cd apps/admin-ui && npx vitest run src/components/workflow-graph/nodes/nodes.spec.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/admin-ui/src/components/workflow-graph/nodes/nodes.spec.tsx
git commit -m "test(admin-ui): add component tests for workflow node components"
```

---

## Chunk 4: Workflow Graph + Context Inspector + Page

### Task 7: Create the WorkflowGraph React Flow component

**Files:**
- Create: `apps/admin-ui/src/components/workflow-graph/workflow-graph.tsx`

- [ ] **Step 1: Create workflow-graph.tsx**

```tsx
import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type NodeTypes,
  type OnSelectionChangeParams,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { WorkflowDefinition } from '@fishplate/workflow-core';
import type { WorkflowExecutionView } from '@/types/execution-view';
import { layoutWorkflowGraph, type WorkflowNodeData, type WorkflowEdgeData } from '@/lib/graph-layout';
import { ActionNode, DecisionNode, ForkNode, GateNode, TerminalNode, WorkflowNode } from './nodes';

const nodeTypes: NodeTypes = {
  action: ActionNode,
  decision: DecisionNode,
  fork: ForkNode,
  gate: GateNode,
  terminal: TerminalNode,
  workflow: WorkflowNode,
};

interface WorkflowGraphProps {
  definition: WorkflowDefinition;
  execution: WorkflowExecutionView;
  onNodeSelect?: (nodeId: string | null) => void;
}

export function WorkflowGraph({ definition, execution, onNodeSelect }: WorkflowGraphProps) {
  const { nodes, edges } = useMemo(
    () => layoutWorkflowGraph(definition, execution),
    [definition, execution],
  );

  const styledEdges = useMemo(
    () =>
      edges.map(edge => ({
        ...edge,
        animated: edge.data?.taken,
        style: {
          stroke: edge.data?.taken ? '#3b82f6' : '#3f3f46',
          strokeWidth: edge.data?.taken ? 2 : 1,
          strokeDasharray: edge.data?.taken ? undefined : '5 5',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edge.data?.taken ? '#3b82f6' : '#3f3f46',
        },
        label: edge.data?.when
          ? edge.data.when.length > 30
            ? edge.data.when.substring(0, 30) + '...'
            : edge.data.when
          : undefined,
        labelStyle: { fill: '#71717a', fontSize: 10 },
        labelBgStyle: { fill: '#09090b', fillOpacity: 0.8 },
      })),
    [edges],
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      if (selectedNodes.length > 0) {
        onNodeSelect?.(selectedNodes[0].id);
      } else {
        onNodeSelect?.(null);
      }
    },
    [onNodeSelect],
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onSelectionChange={handleSelectionChange}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background color="#27272a" gap={20} />
        <Controls className="!bg-zinc-800 !border-zinc-700 [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400" />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin-ui/src/components/workflow-graph/workflow-graph.tsx
git commit -m "feat(admin-ui): add WorkflowGraph React Flow component with edge styling"
```

---

### Task 8: Create context inspector

**Files:**
- Create: `apps/admin-ui/src/components/context-inspector/context-inspector.tsx`

- [ ] **Step 1: Create context-inspector.tsx**

```tsx
import type { WorkflowDefinition } from '@fishplate/workflow-core';
import type { WorkflowExecutionView } from '@/types/execution-view';
import { cn } from '@/lib/utils';

interface ContextInspectorProps {
  definition: WorkflowDefinition;
  execution: WorkflowExecutionView;
  selectedNodeId: string | null;
}

const statusColors: Record<string, string> = {
  completed: 'text-emerald-400',
  running: 'text-blue-400',
  failed: 'text-red-400',
  waiting: 'text-amber-400',
  pending: 'text-zinc-500',
};

export function ContextInspector({ definition, execution, selectedNodeId }: ContextInspectorProps) {
  if (!selectedNodeId) {
    return (
      <div className="w-80 border-l border-zinc-800 p-4 bg-zinc-900/50">
        <p className="text-sm text-zinc-500">Select a node to inspect</p>
      </div>
    );
  }

  const node = definition.nodes.find(n => n.id === selectedNodeId);
  const nodeState = execution.nodeStates.find(ns => ns.nodeId === selectedNodeId);
  const outgoingEdges = definition.edges.filter(e => e.from === selectedNodeId);
  const outgoingEdgeStates = execution.edgeStates.filter(e => e.from === selectedNodeId);

  if (!node || !nodeState) {
    return (
      <div className="w-80 border-l border-zinc-800 p-4 bg-zinc-900/50">
        <p className="text-sm text-zinc-500">Node not found</p>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-zinc-800 p-4 bg-zinc-900/50 overflow-y-auto">
      <h3 className="text-sm font-semibold text-zinc-200 mb-3">Node Inspector</h3>

      <Section title="Identity">
        <Field label="ID" value={node.id} />
        <Field label="Type" value={node.type} />
        {node.handler && <Field label="Handler" value={node.handler} />}
        <Field label="Status">
          <span className={cn('font-medium', statusColors[nodeState.status])}>
            {nodeState.status}
          </span>
        </Field>
      </Section>

      <Section title="CEL Input">
        <div className="text-xs font-mono text-zinc-400 bg-zinc-800 rounded p-2 break-all">
          {node.input ?? 'No input expression'}
        </div>
      </Section>

      {nodeState.input && (
        <Section title="Evaluated Input">
          <JsonBlock data={nodeState.input} />
        </Section>
      )}

      {nodeState.output && (
        <Section title="Output">
          <JsonBlock data={nodeState.output} />
        </Section>
      )}

      {nodeState.error && (
        <Section title="Error">
          <div className="text-xs text-red-400 bg-red-500/10 rounded p-2">{nodeState.error}</div>
        </Section>
      )}

      {node.type === 'decision' && outgoingEdges.length > 0 && (
        <Section title="Conditions">
          {outgoingEdges.map((edge, i) => {
            const edgeState = outgoingEdgeStates.find(
              es => es.from === edge.from && es.to === edge.to && es.when === edge.when
            );
            return (
              <div key={i} className="flex items-start gap-2 mb-1">
                <span className={cn('text-xs', edgeState?.taken ? 'text-blue-400' : 'text-zinc-500')}>
                  {edgeState?.taken ? '→' : '○'}
                </span>
                <div className="text-xs">
                  <span className="text-zinc-400 font-mono">{edge.when ?? '(default)'}</span>
                  <span className="text-zinc-600 ml-1">→ {edge.to}</span>
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {node.type === 'fork' && node.branches && (
        <Section title="Branches">
          {node.branches.map(b => (
            <div key={b} className="text-xs text-zinc-400">{b}</div>
          ))}
        </Section>
      )}

      {node.type === 'workflow' && (
        <Section title="Child Workflow">
          <Field label="Ref" value={node.workflowRef ?? ''} />
          {node.workflowVersion && <Field label="Version" value={`v${node.workflowVersion}`} />}
        </Section>
      )}

      {nodeState.startedAt && (
        <Section title="Timing">
          <Field label="Started" value={new Date(nodeState.startedAt).toLocaleTimeString()} />
          {nodeState.completedAt && (
            <Field label="Completed" value={new Date(nodeState.completedAt).toLocaleTimeString()} />
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between text-xs mb-0.5">
      <span className="text-zinc-500">{label}</span>
      {children ?? <span className="text-zinc-300 font-mono">{value}</span>}
    </div>
  );
}

function JsonBlock({ data }: { data: Record<string, any> }) {
  return (
    <pre className="text-xs font-mono text-zinc-400 bg-zinc-800 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin-ui/src/components/context-inspector/
git commit -m "feat(admin-ui): add context inspector panel for node details"
```

---

### Task 9: Create the TanStack Query hook and wire up the page

**Files:**
- Create: `apps/admin-ui/src/hooks/use-workflow.ts`
- Create: `apps/admin-ui/src/routes/workflow-view.tsx`
- Modify: `apps/admin-ui/src/app.tsx`

- [ ] **Step 1: Create use-workflow.ts**

```typescript
import { useQuery } from '@tanstack/react-query';
import type { WorkflowDefinition } from '@fishplate/workflow-core';
import type { WorkflowExecutionView } from '@/types/execution-view';
import { sampleDefinition, sampleExecution } from '@/mocks/sample-workflow';

interface WorkflowData {
  definition: WorkflowDefinition;
  execution: WorkflowExecutionView;
}

export function useWorkflow(executionId: string) {
  return useQuery<WorkflowData>({
    queryKey: ['workflow-execution', executionId],
    queryFn: async () => {
      // Mock: return hardcoded data regardless of executionId
      return {
        definition: sampleDefinition,
        execution: sampleExecution,
      };
    },
  });
}
```

- [ ] **Step 2: Create workflow-view.tsx**

```tsx
import { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useWorkflow } from '@/hooks/use-workflow';
import { WorkflowGraph } from '@/components/workflow-graph/workflow-graph';
import { ContextInspector } from '@/components/context-inspector/context-inspector';

export function WorkflowView() {
  const { data, isLoading, error } = useWorkflow('exec-001');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-500">Loading workflow...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-400">Failed to load workflow</p>
      </div>
    );
  }

  const { definition, execution } = data;

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">{definition.name}</h1>
          <p className="text-xs text-zinc-500">
            v{definition.version} — Execution: {execution.executionId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${
            execution.status === 'running' ? 'bg-blue-500 animate-pulse' :
            execution.status === 'completed' ? 'bg-emerald-500' :
            execution.status === 'failed' ? 'bg-red-500' :
            execution.status === 'waiting' ? 'bg-amber-500 animate-pulse' :
            'bg-zinc-500'
          }`} />
          <span className="text-sm text-zinc-400">{execution.status}</span>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <ReactFlowProvider>
            <WorkflowGraph
              definition={definition}
              execution={execution}
              onNodeSelect={setSelectedNodeId}
            />
          </ReactFlowProvider>
        </div>
        <ContextInspector
          definition={definition}
          execution={execution}
          selectedNodeId={selectedNodeId}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update app.tsx**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkflowView } from './routes/workflow-view';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkflowView />
    </QueryClientProvider>
  );
}
```

Note: `app.css` is already imported in `main.tsx` from Task 1. Do NOT add it here.

- [ ] **Step 4: Verify build**

Run: `cd apps/admin-ui && npx vite build`
Expected: builds without errors

- [ ] **Step 5: Commit**

```bash
git add apps/admin-ui/src/
git commit -m "feat(admin-ui): wire up workflow view page with graph, inspector, and mock data"
```

---

## Chunk 5: Final Verification

### Task 10: Run all tests and verify dev server

- [ ] **Step 1: Run tests**

Run: `./nx test admin-ui`
Expected: all tests pass (graph-layout tests)

- [ ] **Step 2: Start dev server and visual check**

Run: `./nx dev admin-ui`
Expected: opens on localhost, shows the SDLC workflow graph with:
- "generate" and "test" nodes with green borders (completed)
- "review" node with pulsing blue border (running)
- "deploy", "done", "failed" nodes dimmed (pending)
- Edges from generate→test and test→review highlighted blue
- Clicking a node shows details in the inspector panel

- [ ] **Step 3: Fix any issues found during visual check**

- [ ] **Step 4: Final commit if adjustments needed**

```bash
git add -A
git commit -m "chore(admin-ui): finalize workflow monitor UI"
```
