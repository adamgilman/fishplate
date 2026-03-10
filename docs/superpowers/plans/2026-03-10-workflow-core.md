# Workflow Core Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@fishplate/workflow-core` — a pure TypeScript library for defining, validating, and traversing CEL-based workflow graphs.

**Architecture:** JSON workflow graphs with embedded CEL expressions for conditions and data transforms. A command-pattern GraphWalker yields instructions (execute_action, fork, wait_for_signal, etc.) that the host maps to DBOS durable primitives. Multi-tenant Postgres storage with row-level security. No DBOS dependency in the library itself.

**Tech Stack:** TypeScript, Vitest (testing), `@marcbachmann/cel-js` (CEL evaluation), `pg` (Postgres client), Nx (build)

**Spec:** `docs/superpowers/specs/2026-03-10-workflow-core-design.md`

---

## Chunk 1: Project Scaffolding + Models

### Task 1: Scaffold the Nx library

**Files:**
- Create: `libs/workflow-core/package.json`
- Create: `libs/workflow-core/tsconfig.json`
- Create: `libs/workflow-core/tsconfig.spec.json`
- Create: `libs/workflow-core/project.json`
- Create: `libs/workflow-core/src/index.ts`
- Modify: `tsconfig.base.json` (add path alias)

- [ ] **Step 1: Create project.json**

```json
{
  "name": "workflow-core",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/workflow-core/src",
  "projectType": "library",
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "options": {
        "outputPath": "dist/libs/workflow-core",
        "main": "libs/workflow-core/src/index.ts",
        "tsConfig": "libs/workflow-core/tsconfig.json",
        "assets": []
      }
    },
    "test": {
      "executor": "@nx/js:node",
      "options": {
        "command": "npx vitest run",
        "cwd": "libs/workflow-core"
      }
    }
  }
}
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "@fishplate/workflow-core",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@marcbachmann/cel-js": "^0.5.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "typescript": "~5.7.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "declaration": true,
    "types": ["vitest"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts"]
}
```

- [ ] **Step 4: Create tsconfig.spec.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts", "src/**/*.spec.ts"]
}
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
```

- [ ] **Step 6: Create empty src/index.ts**

```typescript
// @fishplate/workflow-core
```

- [ ] **Step 7: Add path alias to tsconfig.base.json**

In `tsconfig.base.json`, add to `compilerOptions.paths`:
```json
"@fishplate/workflow-core": ["libs/workflow-core/src/index.ts"]
```

- [ ] **Step 8: Install dependencies**

Run: `npm install @marcbachmann/cel-js && npm install -D vitest`
Expected: packages install successfully

- [ ] **Step 9: Verify Nx sees the project**

Run: `./nx show project workflow-core`
Expected: shows project config with build and test targets

- [ ] **Step 10: Commit**

```bash
git add libs/workflow-core/ tsconfig.base.json package.json package-lock.json
git commit -m "chore: scaffold workflow-core Nx library"
```

---

### Task 2: Define model types

**Files:**
- Create: `libs/workflow-core/src/models/definition.ts`
- Create: `libs/workflow-core/src/models/execution.ts`
- Create: `libs/workflow-core/src/models/handler.ts`
- Create: `libs/workflow-core/src/models/index.ts`
- Modify: `libs/workflow-core/src/index.ts`
- Test: `libs/workflow-core/src/models/definition.spec.ts`

- [ ] **Step 1: Write test for type guards**

Create `libs/workflow-core/src/models/definition.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { isNodeType } from './definition';

describe('isNodeType', () => {
  it('returns true for valid node types', () => {
    expect(isNodeType('action')).toBe(true);
    expect(isNodeType('decision')).toBe(true);
    expect(isNodeType('fork')).toBe(true);
    expect(isNodeType('gate')).toBe(true);
    expect(isNodeType('terminal')).toBe(true);
    expect(isNodeType('workflow')).toBe(true);
  });

  it('returns false for invalid node types', () => {
    expect(isNodeType('invalid')).toBe(false);
    expect(isNodeType('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd libs/workflow-core && npx vitest run src/models/definition.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write definition.ts**

Create `libs/workflow-core/src/models/definition.ts`:
```typescript
export const NODE_TYPES = ['action', 'decision', 'fork', 'gate', 'terminal', 'workflow'] as const;
export type NodeType = typeof NODE_TYPES[number];

export function isNodeType(value: string): value is NodeType {
  return NODE_TYPES.includes(value as NodeType);
}

export interface WorkflowDefinition {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  isTemplate: boolean;
  createdBy?: 'system' | 'user' | 'llm';
  createdAt: Date;
  entrypoint: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  maxIterations?: number;
}

export interface WorkflowGraph {
  entrypoint: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  maxIterations?: number;
}

export interface NodeDefinition {
  id: string;
  type: NodeType;
  handler?: string;
  input?: string;
  workflowRef?: string;
  workflowVersion?: number;
  workflowInput?: string;
  timeoutMs?: number;
  timeoutEdge?: string;
  branches?: string[];
  joinNode?: string;
}

export interface EdgeDefinition {
  from: string;
  to: string;
  when?: string;
  priority?: number;
  maxIterations?: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd libs/workflow-core && npx vitest run src/models/definition.spec.ts`
Expected: PASS

- [ ] **Step 5: Write execution.ts**

Create `libs/workflow-core/src/models/execution.ts`:
```typescript
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting';

export interface WorkflowExecution {
  id: string;
  tenantId: string;
  definitionId: string;
  parentExecutionId?: string;
  dbosWorkflowId?: string;
  status: ExecutionStatus;
  currentNodeId?: string;
  context: Record<string, any>;
  params: Record<string, any>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface WorkflowResult {
  executionId: string;
  context: Record<string, any>;
  status: 'completed' | 'failed';
  error?: string;
}
```

- [ ] **Step 6: Write handler.ts**

Create `libs/workflow-core/src/models/handler.ts`:
```typescript
export interface ActionHandler {
  execute(input: Record<string, any>): Promise<ActionResult>;
}

export interface ActionResult {
  contextUpdates: Record<string, any>;
}
```

- [ ] **Step 7: Write models/index.ts and update src/index.ts**

Create `libs/workflow-core/src/models/index.ts`:
```typescript
export * from './definition';
export * from './execution';
export * from './handler';
```

Update `libs/workflow-core/src/index.ts`:
```typescript
export * from './models';
```

- [ ] **Step 8: Run all tests**

Run: `cd libs/workflow-core && npx vitest run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add libs/workflow-core/src/models/ libs/workflow-core/src/index.ts
git commit -m "feat(workflow-core): add model types for definitions, executions, and handlers"
```

---

## Chunk 2: CEL Evaluator + Validator

### Task 3: CEL evaluator

**Files:**
- Create: `libs/workflow-core/src/cel/evaluator.ts`
- Create: `libs/workflow-core/src/cel/index.ts`
- Test: `libs/workflow-core/src/cel/evaluator.spec.ts`
- Modify: `libs/workflow-core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `libs/workflow-core/src/cel/evaluator.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { CelEvaluator } from './evaluator';

describe('CelEvaluator', () => {
  const evaluator = new CelEvaluator();

  describe('evaluateCondition', () => {
    it('evaluates a true condition', () => {
      const result = evaluator.evaluateCondition('ctx.score > 0.5', {
        ctx: { score: 0.8 },
        _loop: {},
      });
      expect(result).toBe(true);
    });

    it('evaluates a false condition', () => {
      const result = evaluator.evaluateCondition('ctx.score > 0.5', {
        ctx: { score: 0.3 },
        _loop: {},
      });
      expect(result).toBe(false);
    });

    it('supports _loop variables', () => {
      const result = evaluator.evaluateCondition(
        '_loop["review->generate"] < 3',
        { ctx: {}, _loop: { 'review->generate': 2 } }
      );
      expect(result).toBe(true);
    });

    it('returns fail result for non-boolean return', () => {
      expect(() =>
        evaluator.evaluateCondition('ctx.name', {
          ctx: { name: 'hello' },
          _loop: {},
        })
      ).toThrow(/expected boolean/i);
    });

    it('throws on CEL evaluation error', () => {
      expect(() =>
        evaluator.evaluateCondition('invalid..syntax', {
          ctx: {},
          _loop: {},
        })
      ).toThrow();
    });
  });

  describe('evaluateInput', () => {
    it('evaluates a CEL expression to an object', () => {
      const result = evaluator.evaluateInput('{"code": ctx.code, "lang": ctx.lang}', {
        ctx: { code: 'hello()', lang: 'python' },
        _loop: {},
      });
      expect(result).toEqual({ code: 'hello()', lang: 'python' });
    });

    it('throws for non-object return', () => {
      expect(() =>
        evaluator.evaluateInput('"just a string"', {
          ctx: {},
          _loop: {},
        })
      ).toThrow(/expected object/i);
    });
  });

  describe('validate', () => {
    it('returns true for valid CEL expression', () => {
      expect(evaluator.validate('ctx.x > 1')).toBe(true);
    });

    it('returns false for invalid CEL syntax', () => {
      expect(evaluator.validate('ctx..x >')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd libs/workflow-core && npx vitest run src/cel/evaluator.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write evaluator.ts**

Create `libs/workflow-core/src/cel/evaluator.ts`:
```typescript
import { evaluate, parse } from '@marcbachmann/cel-js';

export interface CelContext {
  ctx: Record<string, any>;
  _loop: Record<string, number>;
}

export class CelEvaluator {
  evaluateCondition(expression: string, context: CelContext): boolean {
    const result = evaluate(expression, context);
    if (typeof result !== 'boolean') {
      throw new Error(
        `CEL condition '${expression}' returned ${typeof result}, expected boolean`
      );
    }
    return result;
  }

  evaluateInput(expression: string, context: CelContext): Record<string, any> {
    const result = evaluate(expression, context);
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      throw new Error(
        `CEL input '${expression}' returned ${typeof result}, expected object`
      );
    }
    return result as Record<string, any>;
  }

  validate(expression: string): boolean {
    try {
      parse(expression);
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd libs/workflow-core && npx vitest run src/cel/evaluator.spec.ts`
Expected: PASS

- [ ] **Step 5: Create cel/index.ts and update exports**

Create `libs/workflow-core/src/cel/index.ts`:
```typescript
export { CelEvaluator } from './evaluator';
export type { CelContext } from './evaluator';
```

Update `libs/workflow-core/src/index.ts`:
```typescript
export * from './models';
export * from './cel';
```

- [ ] **Step 6: Commit**

```bash
git add libs/workflow-core/src/cel/
git commit -m "feat(workflow-core): add CEL evaluator with condition, input, and validation support"
```

---

## Chunk 3: Graph Validation

### Task 4: Schema validation

**Files:**
- Create: `libs/workflow-core/src/validation/schema.ts`
- Create: `libs/workflow-core/src/validation/index.ts`
- Test: `libs/workflow-core/src/validation/schema.spec.ts`
- Modify: `libs/workflow-core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `libs/workflow-core/src/validation/schema.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { validateSchema } from './schema';
import type { WorkflowGraph } from '../models';

const validGraph: WorkflowGraph = {
  entrypoint: 'start',
  nodes: [
    { id: 'start', type: 'action', handler: 'do_thing' },
    { id: 'end', type: 'terminal' },
  ],
  edges: [{ from: 'start', to: 'end' }],
};

describe('validateSchema', () => {
  it('accepts a valid graph', () => {
    const result = validateSchema(validGraph);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing entrypoint', () => {
    const graph = { ...validGraph, entrypoint: '' };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/entrypoint/i);
  });

  it('rejects action node without handler', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'start',
      nodes: [
        { id: 'start', type: 'action' },
        { id: 'end', type: 'terminal' },
      ],
      edges: [{ from: 'start', to: 'end' }],
    };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/handler/i);
  });

  it('rejects workflow node without workflowRef', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'start',
      nodes: [
        { id: 'start', type: 'workflow' },
        { id: 'end', type: 'terminal' },
      ],
      edges: [{ from: 'start', to: 'end' }],
    };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/workflowRef/i);
  });

  it('rejects fork node without branches', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'start',
      nodes: [
        { id: 'start', type: 'fork', joinNode: 'join' },
        { id: 'join', type: 'terminal' },
      ],
      edges: [],
    };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/branches/i);
  });

  it('rejects fork node without joinNode', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'start',
      nodes: [
        { id: 'start', type: 'fork', branches: ['a'] },
        { id: 'a', type: 'terminal' },
      ],
      edges: [],
    };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/joinNode/i);
  });

  it('rejects empty nodes array', () => {
    const graph: WorkflowGraph = { entrypoint: 'x', nodes: [], edges: [] };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
  });

  it('rejects duplicate node IDs', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h' },
        { id: 'a', type: 'terminal' },
      ],
      edges: [],
    };
    const result = validateSchema(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/duplicate/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd libs/workflow-core && npx vitest run src/validation/schema.spec.ts`
Expected: FAIL

- [ ] **Step 3: Write schema.ts**

Create `libs/workflow-core/src/validation/schema.ts`:
```typescript
import { NODE_TYPES, type WorkflowGraph } from '../models';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSchema(graph: WorkflowGraph): ValidationResult {
  const errors: string[] = [];

  if (!graph.entrypoint) {
    errors.push('entrypoint is required');
  }

  if (!graph.nodes || graph.nodes.length === 0) {
    errors.push('nodes array must not be empty');
  }

  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (!node.id) {
      errors.push('every node must have an id');
      continue;
    }
    if (nodeIds.has(node.id)) {
      errors.push(`duplicate node id: '${node.id}'`);
    }
    nodeIds.add(node.id);

    if (!NODE_TYPES.includes(node.type as any)) {
      errors.push(`node '${node.id}' has invalid type '${node.type}'`);
    }

    switch (node.type) {
      case 'action':
        if (!node.handler) errors.push(`action node '${node.id}' must have a handler`);
        break;
      case 'workflow':
        if (!node.workflowRef) errors.push(`workflow node '${node.id}' must have a workflowRef`);
        break;
      case 'fork':
        if (!node.branches || node.branches.length === 0)
          errors.push(`fork node '${node.id}' must have branches`);
        if (!node.joinNode) errors.push(`fork node '${node.id}' must have a joinNode`);
        break;
    }
  }

  for (const edge of graph.edges) {
    if (!edge.from) errors.push('every edge must have a from field');
    if (!edge.to) errors.push('every edge must have a to field');
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd libs/workflow-core && npx vitest run src/validation/schema.spec.ts`
Expected: PASS

- [ ] **Step 5: Create validation/index.ts and update exports**

Create `libs/workflow-core/src/validation/index.ts`:
```typescript
export { validateSchema } from './schema';
export type { ValidationResult } from './schema';
```

Update `libs/workflow-core/src/index.ts`:
```typescript
export * from './models';
export * from './cel';
export * from './validation';
```

- [ ] **Step 6: Commit**

```bash
git add libs/workflow-core/src/validation/ libs/workflow-core/src/index.ts
git commit -m "feat(workflow-core): add schema validation for workflow graphs"
```

---

### Task 5: Graph structural validation

**Files:**
- Create: `libs/workflow-core/src/graph/validator.ts`
- Create: `libs/workflow-core/src/graph/index.ts`
- Test: `libs/workflow-core/src/graph/validator.spec.ts`
- Modify: `libs/workflow-core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `libs/workflow-core/src/graph/validator.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { validateGraph } from './validator';
import type { WorkflowGraph } from '../models';

describe('validateGraph', () => {
  it('accepts a valid linear graph', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h' },
        { id: 'b', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
  });

  it('rejects when entrypoint node does not exist', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'missing',
      nodes: [{ id: 'a', type: 'terminal' }],
      edges: [],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/entrypoint/i);
  });

  it('rejects orphan nodes', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'terminal' },
        { id: 'orphan', type: 'action', handler: 'h' },
      ],
      edges: [],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/orphan|unreachable/i);
  });

  it('rejects dangling edges', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [{ id: 'a', type: 'action', handler: 'h' }],
      edges: [{ from: 'a', to: 'missing' }],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/dangling|missing/i);
  });

  it('rejects terminal nodes with outgoing edges', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'terminal' },
        { id: 'b', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/terminal/i);
  });

  it('rejects action nodes with zero outgoing edges', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [{ id: 'a', type: 'action', handler: 'h' }],
      edges: [],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/exactly one outgoing edge/i);
  });

  it('rejects action nodes with multiple outgoing edges', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h' },
        { id: 'b', type: 'terminal' },
        { id: 'c', type: 'terminal' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/exactly one outgoing edge/i);
  });

  it('rejects decision nodes with zero outgoing edges', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [{ id: 'a', type: 'decision' }],
      edges: [],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/at least one outgoing edge/i);
  });

  it('accepts decision nodes with multiple outgoing edges', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'd',
      nodes: [
        { id: 'd', type: 'decision' },
        { id: 'a', type: 'terminal' },
        { id: 'b', type: 'terminal' },
      ],
      edges: [
        { from: 'd', to: 'a', when: 'ctx.x > 0' },
        { from: 'd', to: 'b' },
      ],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
  });

  it('rejects gate nodes with timeoutEdge pointing to missing node', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'g',
      nodes: [
        { id: 'g', type: 'gate', timeoutEdge: 'missing' },
        { id: 'b', type: 'terminal' },
      ],
      edges: [{ from: 'g', to: 'b' }],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/timeoutEdge/i);
  });

  it('rejects fork with non-existent branch entries', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'f',
      nodes: [
        { id: 'f', type: 'fork', branches: ['missing'], joinNode: 'j' },
        { id: 'j', type: 'terminal' },
      ],
      edges: [],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/branch/i);
  });

  it('rejects fork with duplicate branch entries', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'f',
      nodes: [
        { id: 'f', type: 'fork', branches: ['a', 'a'], joinNode: 'j' },
        { id: 'a', type: 'action', handler: 'h' },
        { id: 'j', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'j' }],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/duplicate/i);
  });

  it('rejects fork with missing joinNode', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'f',
      nodes: [
        { id: 'f', type: 'fork', branches: ['a'], joinNode: 'missing' },
        { id: 'a', type: 'action', handler: 'h' },
      ],
      edges: [{ from: 'a', to: 'missing' }],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/joinNode/i);
  });

  it('rejects fork where joinNode is not reachable from a branch', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'f',
      nodes: [
        { id: 'f', type: 'fork', branches: ['b1', 'b2'], joinNode: 'join' },
        { id: 'b1', type: 'action', handler: 'h1' },
        { id: 'b2', type: 'action', handler: 'h2' },
        { id: 'dead', type: 'terminal' },
        { id: 'join', type: 'terminal' },
      ],
      edges: [
        { from: 'b1', to: 'join' },
        { from: 'b2', to: 'dead' }, // b2 cannot reach join
      ],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/reachable.*joinNode|joinNode.*reachable/i);
  });

  it('accepts valid graph with cycle (loop)', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'gen',
      nodes: [
        { id: 'gen', type: 'action', handler: 'generate' },
        { id: 'test', type: 'action', handler: 'run_tests' },
        { id: 'check', type: 'decision' },
        { id: 'done', type: 'terminal' },
      ],
      edges: [
        { from: 'gen', to: 'test' },
        { from: 'test', to: 'check' },
        { from: 'check', to: 'done', when: 'ctx.pass', priority: 0 },
        { from: 'check', to: 'gen', when: '!ctx.pass', priority: 1 },
      ],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd libs/workflow-core && npx vitest run src/graph/validator.spec.ts`
Expected: FAIL

- [ ] **Step 3: Write validator.ts**

Create `libs/workflow-core/src/graph/validator.ts`:
```typescript
import type { WorkflowGraph, NodeDefinition } from '../models';
import type { ValidationResult } from '../validation/schema';

function isReachable(from: string, to: string, adjacency: Map<string, Set<string>>): boolean {
  const visited = new Set<string>();
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return false;
}

export function validateGraph(graph: WorkflowGraph): ValidationResult {
  const errors: string[] = [];
  const nodeMap = new Map<string, NodeDefinition>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  // Entrypoint exists
  if (!nodeMap.has(graph.entrypoint)) {
    errors.push(`entrypoint node '${graph.entrypoint}' does not exist`);
    return { valid: false, errors };
  }

  // Dangling edges
  for (const edge of graph.edges) {
    if (!nodeMap.has(edge.from)) {
      errors.push(`edge references missing 'from' node '${edge.from}'`);
    }
    if (!nodeMap.has(edge.to)) {
      errors.push(`edge references missing 'to' node '${edge.to}' (dangling edge)`);
    }
  }
  if (errors.length > 0) return { valid: false, errors };

  // Build adjacency for reachability (edges + fork branches + timeoutEdge)
  const adjacency = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of graph.edges) {
    adjacency.get(edge.from)!.add(edge.to);
  }
  for (const node of graph.nodes) {
    if (node.type === 'fork' && node.branches) {
      for (const b of node.branches) {
        adjacency.get(node.id)!.add(b);
      }
    }
    if (node.type === 'gate' && node.timeoutEdge) {
      adjacency.get(node.id)!.add(node.timeoutEdge);
    }
  }

  // Reachability (BFS from entrypoint)
  const visited = new Set<string>();
  const queue = [graph.entrypoint];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      errors.push(`node '${node.id}' is unreachable from entrypoint (orphan)`);
    }
  }

  // Outgoing edge counts by node
  const outgoingCount = new Map<string, number>();
  for (const node of graph.nodes) outgoingCount.set(node.id, 0);
  for (const edge of graph.edges) {
    outgoingCount.set(edge.from, (outgoingCount.get(edge.from) ?? 0) + 1);
  }

  for (const node of graph.nodes) {
    const count = outgoingCount.get(node.id) ?? 0;

    switch (node.type) {
      case 'terminal':
        if (count > 0) {
          errors.push(`terminal node '${node.id}' must have no outgoing edges`);
        }
        break;
      case 'decision':
        if (count < 1) {
          errors.push(`decision node '${node.id}' must have at least one outgoing edge`);
        }
        break;
      case 'gate':
        if (count !== 1) {
          errors.push(`gate node '${node.id}' must have exactly one outgoing edge`);
        }
        if (node.timeoutEdge && !nodeMap.has(node.timeoutEdge)) {
          errors.push(`gate node '${node.id}' timeoutEdge references missing node '${node.timeoutEdge}'`);
        }
        break;
      case 'fork':
        // Fork uses branches, not edges, for fan-out
        if (node.branches) {
          const branchSet = new Set<string>();
          for (const b of node.branches) {
            if (!nodeMap.has(b)) {
              errors.push(`fork node '${node.id}' branch '${b}' does not exist`);
            }
            if (branchSet.has(b)) {
              errors.push(`fork node '${node.id}' has duplicate branch '${b}'`);
            }
            branchSet.add(b);
          }
        }
        if (node.joinNode && !nodeMap.has(node.joinNode)) {
          errors.push(`fork node '${node.id}' joinNode '${node.joinNode}' does not exist`);
        }
        // Verify joinNode is reachable from each branch entrypoint
        if (node.branches && node.joinNode && nodeMap.has(node.joinNode)) {
          for (const branchId of node.branches) {
            if (nodeMap.has(branchId) && !isReachable(branchId, node.joinNode, adjacency)) {
              errors.push(`fork node '${node.id}' joinNode '${node.joinNode}' is not reachable from branch '${branchId}'`);
            }
          }
        }
        break;
      default:
        // action, workflow — exactly one outgoing edge
        if (count !== 1) {
          errors.push(`${node.type} node '${node.id}' must have exactly one outgoing edge (has ${count})`);
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd libs/workflow-core && npx vitest run src/graph/validator.spec.ts`
Expected: PASS

- [ ] **Step 5: Create graph/index.ts and update exports**

Create `libs/workflow-core/src/graph/index.ts`:
```typescript
export { validateGraph } from './validator';
```

Update `libs/workflow-core/src/index.ts`:
```typescript
export * from './models';
export * from './cel';
export * from './validation';
export * from './graph';
```

- [ ] **Step 6: Commit**

```bash
git add libs/workflow-core/src/graph/ libs/workflow-core/src/index.ts
git commit -m "feat(workflow-core): add graph structural validation"
```

---

### Task 6: CEL validation layer

**Files:**
- Create: `libs/workflow-core/src/cel/validator.ts`
- Test: `libs/workflow-core/src/cel/validator.spec.ts`
- Modify: `libs/workflow-core/src/cel/index.ts`

- [ ] **Step 1: Write failing tests**

Create `libs/workflow-core/src/cel/validator.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { validateCelExpressions } from './validator';
import type { WorkflowGraph } from '../models';

describe('validateCelExpressions', () => {
  it('accepts graph with valid CEL expressions', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h', input: '{"x": ctx.x}' },
        { id: 'd', type: 'decision' },
        { id: 'e', type: 'terminal' },
      ],
      edges: [
        { from: 'a', to: 'd' },
        { from: 'd', to: 'e', when: 'ctx.x > 1' },
      ],
    };
    const result = validateCelExpressions(graph);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid CEL in node input', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h', input: 'invalid..expr' },
        { id: 'e', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'e' }],
    };
    const result = validateCelExpressions(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/node 'a'/);
  });

  it('rejects invalid CEL in edge when', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'decision' },
        { id: 'b', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'b', when: '>>> bad' }],
    };
    const result = validateCelExpressions(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/edge.*a.*b/i);
  });

  it('accepts graph with no CEL expressions', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h' },
        { id: 'b', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const result = validateCelExpressions(graph);
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd libs/workflow-core && npx vitest run src/cel/validator.spec.ts`
Expected: FAIL

- [ ] **Step 3: Write validator.ts**

Create `libs/workflow-core/src/cel/validator.ts`:
```typescript
import type { WorkflowGraph } from '../models';
import type { ValidationResult } from '../validation/schema';
import { CelEvaluator } from './evaluator';

export function validateCelExpressions(graph: WorkflowGraph): ValidationResult {
  const errors: string[] = [];
  const cel = new CelEvaluator();

  for (const node of graph.nodes) {
    if (node.input && !cel.validate(node.input)) {
      errors.push(`node '${node.id}' has invalid CEL in input: '${node.input}'`);
    }
    if (node.workflowInput && !cel.validate(node.workflowInput)) {
      errors.push(`node '${node.id}' has invalid CEL in workflowInput: '${node.workflowInput}'`);
    }
  }

  for (const edge of graph.edges) {
    if (edge.when && !cel.validate(edge.when)) {
      errors.push(`edge '${edge.from}' -> '${edge.to}' has invalid CEL in when: '${edge.when}'`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd libs/workflow-core && npx vitest run src/cel/validator.spec.ts`
Expected: PASS

- [ ] **Step 5: Update exports**

Update `libs/workflow-core/src/cel/index.ts`:
```typescript
export { CelEvaluator } from './evaluator';
export type { CelContext } from './evaluator';
export { validateCelExpressions } from './validator';
```

- [ ] **Step 6: Commit**

```bash
git add libs/workflow-core/src/cel/
git commit -m "feat(workflow-core): add CEL expression validation layer"
```

---

## Chunk 4: Graph Walker

### Task 7: Loop guard

**Files:**
- Create: `libs/workflow-core/src/graph/loop-guard.ts`
- Test: `libs/workflow-core/src/graph/loop-guard.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `libs/workflow-core/src/graph/loop-guard.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { LoopGuard } from './loop-guard';

describe('LoopGuard', () => {
  it('allows traversal under limit', () => {
    const guard = new LoopGuard(3);
    expect(guard.check('a', 'b')).toBe(true);
    expect(guard.check('a', 'b')).toBe(true);
    expect(guard.check('a', 'b')).toBe(true);
  });

  it('rejects traversal at limit', () => {
    const guard = new LoopGuard(2);
    guard.check('a', 'b');
    guard.check('a', 'b');
    expect(guard.check('a', 'b')).toBe(false);
  });

  it('uses per-edge override when provided', () => {
    const guard = new LoopGuard(100);
    guard.check('a', 'b', 1);
    expect(guard.check('a', 'b', 1)).toBe(false);
  });

  it('tracks edges independently', () => {
    const guard = new LoopGuard(2);
    guard.check('a', 'b');
    guard.check('a', 'b');
    expect(guard.check('a', 'b')).toBe(false);
    expect(guard.check('c', 'd')).toBe(true);
  });

  it('exposes loop map for CEL context', () => {
    const guard = new LoopGuard(10);
    guard.check('a', 'b');
    guard.check('a', 'b');
    const map = guard.getLoopMap();
    expect(map['a->b']).toBe(2);
    expect(map['x->y']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd libs/workflow-core && npx vitest run src/graph/loop-guard.spec.ts`
Expected: FAIL

- [ ] **Step 3: Write loop-guard.ts**

Create `libs/workflow-core/src/graph/loop-guard.ts`:
```typescript
export class LoopGuard {
  private counts = new Map<string, number>();

  constructor(private globalLimit: number) {}

  /**
   * Increment and check the edge traversal count.
   * Returns true if traversal is allowed, false if limit exceeded.
   * Counter is incremented before checking (spec: increment before evaluation).
   */
  check(from: string, to: string, edgeLimit?: number): boolean {
    const key = `${from}->${to}`;
    const current = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, current);
    const limit = edgeLimit ?? this.globalLimit;
    return current <= limit;
  }

  getLoopMap(): Record<string, number> {
    const map: Record<string, number> = {};
    for (const [key, count] of this.counts) {
      map[key] = count;
    }
    return map;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd libs/workflow-core && npx vitest run src/graph/loop-guard.spec.ts`
Expected: PASS

- [ ] **Step 5: Update graph/index.ts**

```typescript
export { validateGraph } from './validator';
export { LoopGuard } from './loop-guard';
```

- [ ] **Step 6: Commit**

```bash
git add libs/workflow-core/src/graph/
git commit -m "feat(workflow-core): add loop guard for back-edge iteration limits"
```

---

### Task 8: GraphWalker — linear and decision traversal

**Files:**
- Create: `libs/workflow-core/src/graph/walker.ts`
- Test: `libs/workflow-core/src/graph/walker.spec.ts`
- Modify: `libs/workflow-core/src/graph/index.ts`

- [ ] **Step 1: Write failing tests for linear and decision traversal**

Create `libs/workflow-core/src/graph/walker.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { GraphWalker } from './walker';
import type { WorkflowDefinition } from '../models';

function makeDef(overrides: Partial<WorkflowDefinition> & Pick<WorkflowDefinition, 'entrypoint' | 'nodes' | 'edges'>): WorkflowDefinition {
  return {
    id: 'def-1',
    tenantId: 'tenant-1',
    name: 'test',
    version: 1,
    isTemplate: false,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('GraphWalker', () => {
  describe('linear traversal', () => {
    it('walks a simple action -> terminal graph', () => {
      const def = makeDef({
        entrypoint: 'a',
        nodes: [
          { id: 'a', type: 'action', handler: 'do_thing', input: '{"x": ctx.x}' },
          { id: 'b', type: 'terminal' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      });

      const walker = new GraphWalker(def, { x: 42 });
      const cmd = walker.next();
      expect(cmd.type).toBe('execute_action');
      if (cmd.type === 'execute_action') {
        expect(cmd.handler).toBe('do_thing');
        expect(cmd.input).toEqual({ x: 42 });
      }

      walker.resolve({ contextUpdates: { result: 'ok' } });
      const cmd2 = walker.next();
      expect(cmd2.type).toBe('complete');
      if (cmd2.type === 'complete') {
        expect(cmd2.context).toEqual({ x: 42, result: 'ok' });
      }
    });

    it('action node without input CEL passes empty input', () => {
      const def = makeDef({
        entrypoint: 'a',
        nodes: [
          { id: 'a', type: 'action', handler: 'h' },
          { id: 'b', type: 'terminal' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      });

      const walker = new GraphWalker(def, {});
      const cmd = walker.next();
      expect(cmd.type).toBe('execute_action');
      if (cmd.type === 'execute_action') {
        expect(cmd.input).toEqual({});
      }
    });
  });

  describe('decision traversal', () => {
    it('follows the matching edge', () => {
      const def = makeDef({
        entrypoint: 'd',
        nodes: [
          { id: 'd', type: 'decision' },
          { id: 'yes', type: 'terminal' },
          { id: 'no', type: 'terminal' },
        ],
        edges: [
          { from: 'd', to: 'yes', when: 'ctx.score > 0.5', priority: 0 },
          { from: 'd', to: 'no', priority: 1 },
        ],
      });

      const walker = new GraphWalker(def, { score: 0.8 });
      const cmd = walker.next();
      expect(cmd.type).toBe('complete');
      if (cmd.type === 'complete') {
        expect(cmd.context).toEqual({ score: 0.8 });
      }
    });

    it('follows fallback edge when no condition matches', () => {
      const def = makeDef({
        entrypoint: 'd',
        nodes: [
          { id: 'd', type: 'decision' },
          { id: 'yes', type: 'terminal' },
          { id: 'no', type: 'terminal' },
        ],
        edges: [
          { from: 'd', to: 'yes', when: 'ctx.score > 0.5', priority: 0 },
          { from: 'd', to: 'no', priority: 1 },
        ],
      });

      const walker = new GraphWalker(def, { score: 0.1 });
      const cmd = walker.next();
      expect(cmd.type).toBe('complete');
    });

    it('emits fail when no edges match (all have conditions)', () => {
      const def = makeDef({
        entrypoint: 'd',
        nodes: [
          { id: 'd', type: 'decision' },
          { id: 'a', type: 'terminal' },
        ],
        edges: [
          { from: 'd', to: 'a', when: 'ctx.x > 100' },
        ],
      });

      const walker = new GraphWalker(def, { x: 1 });
      const cmd = walker.next();
      expect(cmd.type).toBe('fail');
    });
  });

  describe('error propagation', () => {
    it('emits fail after resolve with error', () => {
      const def = makeDef({
        entrypoint: 'a',
        nodes: [
          { id: 'a', type: 'action', handler: 'h' },
          { id: 'b', type: 'terminal' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      });

      const walker = new GraphWalker(def, {});
      walker.next(); // execute_action
      walker.resolve({ error: 'something broke' });
      const cmd = walker.next();
      expect(cmd.type).toBe('fail');
      if (cmd.type === 'fail') {
        expect(cmd.reason).toBe('something broke');
      }
    });
  });

  describe('getContext', () => {
    it('returns accumulated context', () => {
      const def = makeDef({
        entrypoint: 'a',
        nodes: [
          { id: 'a', type: 'action', handler: 'h' },
          { id: 'b', type: 'terminal' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      });

      const walker = new GraphWalker(def, { initial: true });
      walker.next();
      walker.resolve({ contextUpdates: { added: 'value' } });
      expect(walker.getContext()).toEqual({ initial: true, added: 'value' });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd libs/workflow-core && npx vitest run src/graph/walker.spec.ts`
Expected: FAIL

- [ ] **Step 3: Write walker.ts**

Create `libs/workflow-core/src/graph/walker.ts`:
```typescript
import type { WorkflowDefinition, NodeDefinition, EdgeDefinition } from '../models';
import { CelEvaluator, type CelContext } from '../cel/evaluator';
import { LoopGuard } from './loop-guard';

export type WalkerCommand =
  | { type: 'execute_action'; nodeId: string; handler: string; input: Record<string, any> }
  | { type: 'execute_workflow'; nodeId: string; workflowRef: string; workflowVersion?: number; input: Record<string, any> }
  | { type: 'fork'; nodeId: string; branches: string[]; joinNode: string }
  | { type: 'wait_for_signal'; nodeId: string; timeoutMs?: number }
  | { type: 'complete'; context: Record<string, any> }
  | { type: 'fail'; nodeId: string; reason: string };

export interface CommandResult {
  contextUpdates?: Record<string, any>;
  signalReceived?: boolean;
  error?: string;
}

export class GraphWalker {
  private ctx: Record<string, any>;
  private cursorNodeId: string;
  private nodeMap: Map<string, NodeDefinition>;
  private edgesByFrom: Map<string, EdgeDefinition[]>;
  private cel: CelEvaluator;
  private loopGuard: LoopGuard;
  private pendingError: string | null = null;
  private startNodeId: string;
  private stopNodeId: string | null = null;

  constructor(
    private definition: WorkflowDefinition,
    params: Record<string, any>,
  ) {
    this.ctx = { ...params };
    this.cursorNodeId = definition.entrypoint;
    this.startNodeId = definition.entrypoint;
    this.cel = new CelEvaluator();
    this.loopGuard = new LoopGuard(definition.maxIterations ?? 100);

    this.nodeMap = new Map();
    for (const node of definition.nodes) {
      this.nodeMap.set(node.id, node);
    }

    this.edgesByFrom = new Map();
    for (const edge of definition.edges) {
      const list = this.edgesByFrom.get(edge.from) ?? [];
      list.push(edge);
      this.edgesByFrom.set(edge.from, list);
    }
  }

  setBounds(startNodeId: string, stopNodeId: string): void {
    this.cursorNodeId = startNodeId;
    this.startNodeId = startNodeId;
    this.stopNodeId = stopNodeId;
  }

  next(): WalkerCommand {
    // Check for pending error from previous resolve
    if (this.pendingError) {
      const error = this.pendingError;
      this.pendingError = null;
      return { type: 'fail', nodeId: this.cursorNodeId, reason: error };
    }

    // Walk through decision nodes internally until we hit an actionable node
    while (true) {
      // Check for setBounds stop
      if (this.stopNodeId && this.cursorNodeId === this.stopNodeId) {
        return { type: 'complete', context: { ...this.ctx } };
      }

      const node = this.nodeMap.get(this.cursorNodeId);
      if (!node) {
        return { type: 'fail', nodeId: this.cursorNodeId, reason: `node '${this.cursorNodeId}' not found` };
      }

      switch (node.type) {
        case 'terminal':
          return { type: 'complete', context: { ...this.ctx } };

        case 'decision': {
          const nextNodeId = this.resolveDecision(node);
          if (nextNodeId === null) {
            return { type: 'fail', nodeId: node.id, reason: `no matching edge from decision node '${node.id}'` };
          }
          this.cursorNodeId = nextNodeId;
          continue;
        }

        case 'action': {
          const input = this.evaluateInput(node);
          if (input === null) {
            const reason = this.pendingError ?? `CEL input evaluation failed on node '${node.id}'`;
            this.pendingError = null;
            return { type: 'fail', nodeId: node.id, reason };
          }
          return { type: 'execute_action', nodeId: node.id, handler: node.handler!, input };
        }

        case 'workflow': {
          const input = node.workflowInput ? this.evaluateInput({ ...node, input: node.workflowInput }) : {};
          if (input === null) {
            const reason = this.pendingError ?? `CEL workflowInput evaluation failed on node '${node.id}'`;
            this.pendingError = null;
            return { type: 'fail', nodeId: node.id, reason };
          }
          return {
            type: 'execute_workflow',
            nodeId: node.id,
            workflowRef: node.workflowRef!,
            workflowVersion: node.workflowVersion,
            input: input!,
          };
        }

        case 'fork':
          return {
            type: 'fork',
            nodeId: node.id,
            branches: node.branches!,
            joinNode: node.joinNode!,
          };

        case 'gate':
          return {
            type: 'wait_for_signal',
            nodeId: node.id,
            timeoutMs: node.timeoutMs,
          };

        default:
          return { type: 'fail', nodeId: node.id, reason: `unknown node type '${node.type}'` };
      }
    }
  }

  resolve(result: CommandResult): void {
    if (result.error) {
      this.pendingError = result.error;
      return;
    }

    if (result.contextUpdates) {
      Object.assign(this.ctx, result.contextUpdates);
    }

    const node = this.nodeMap.get(this.cursorNodeId)!;

    // Gate node: route based on signalReceived
    if (node.type === 'gate') {
      if (result.signalReceived) {
        this.advanceToNextEdge(node.id);
      } else if (node.timeoutEdge) {
        this.cursorNodeId = node.timeoutEdge;
      } else {
        this.pendingError = `gate '${node.id}' timed out with no timeoutEdge`;
      }
      return;
    }

    // Fork node: advance to joinNode
    if (node.type === 'fork') {
      this.cursorNodeId = node.joinNode!;
      return;
    }

    // Action, workflow: follow single outgoing edge (with loop guard)
    this.advanceToNextEdge(node.id);
  }

  getContext(): Record<string, any> {
    return { ...this.ctx };
  }

  private resolveDecision(node: NodeDefinition): string | null {
    const edges = (this.edgesByFrom.get(node.id) ?? [])
      .slice()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    const celContext: CelContext = { ctx: this.ctx, _loop: this.loopGuard.getLoopMap() };

    let matchedEdge: typeof edges[0] | null = null;

    for (const edge of edges) {
      if (!edge.when) {
        // Default/fallback edge
        matchedEdge = edge;
        break;
      }

      try {
        const result = this.cel.evaluateCondition(edge.when, celContext);
        if (result) {
          matchedEdge = edge;
          break;
        }
      } catch (e: any) {
        this.pendingError = `CEL expression on edge '${edge.from}->${edge.to}' failed: ${e.message}`;
        return null;
      }
    }

    if (!matchedEdge) return null;

    // Only check loop guard on the edge actually taken
    const allowed = this.loopGuard.check(matchedEdge.from, matchedEdge.to, matchedEdge.maxIterations);
    if (!allowed) {
      this.pendingError = `loop limit exceeded on edge '${matchedEdge.from}->${matchedEdge.to}'`;
      return null;
    }

    return matchedEdge.to;
  }

  private evaluateInput(node: NodeDefinition): Record<string, any> | null {
    if (!node.input) return {};

    const celContext: CelContext = { ctx: this.ctx, _loop: this.loopGuard.getLoopMap() };
    try {
      return this.cel.evaluateInput(node.input, celContext);
    } catch (e: any) {
      this.pendingError = `CEL input on node '${node.id}' failed: ${e.message}`;
      return null;
    }
  }

  private advanceToNextEdge(nodeId: string): void {
    const edges = this.edgesByFrom.get(nodeId) ?? [];
    const edge = edges[0];
    if (!edge) return;

    // Check loop guard on non-decision edge traversals too
    const allowed = this.loopGuard.check(edge.from, edge.to, edge.maxIterations);
    if (!allowed) {
      this.pendingError = `loop limit exceeded on edge '${edge.from}->${edge.to}'`;
      return;
    }

    this.cursorNodeId = edge.to;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd libs/workflow-core && npx vitest run src/graph/walker.spec.ts`
Expected: PASS

- [ ] **Step 5: Update graph/index.ts**

```typescript
export { validateGraph } from './validator';
export { LoopGuard } from './loop-guard';
export { GraphWalker } from './walker';
export type { WalkerCommand, CommandResult } from './walker';
```

Update `libs/workflow-core/src/index.ts`:
```typescript
export * from './models';
export * from './cel';
export * from './validation';
export * from './graph';
```

- [ ] **Step 6: Commit**

```bash
git add libs/workflow-core/src/graph/
git commit -m "feat(workflow-core): add GraphWalker with linear, decision, and error traversal"
```

---

### Task 9: GraphWalker — gate, fork, workflow, setBounds, loops

**Files:**
- Modify: `libs/workflow-core/src/graph/walker.spec.ts` (add tests)

- [ ] **Step 1: Write additional tests for gate, fork, workflow, setBounds, loops**

Append to `libs/workflow-core/src/graph/walker.spec.ts`:
```typescript
  describe('gate traversal', () => {
    const gateDef = makeDef({
      entrypoint: 'g',
      nodes: [
        { id: 'g', type: 'gate', timeoutMs: 5000, timeoutEdge: 'timeout_node' },
        { id: 'approved', type: 'terminal' },
        { id: 'timeout_node', type: 'terminal' },
      ],
      edges: [{ from: 'g', to: 'approved' }],
    });

    it('emits wait_for_signal command', () => {
      const walker = new GraphWalker(gateDef, {});
      const cmd = walker.next();
      expect(cmd.type).toBe('wait_for_signal');
      if (cmd.type === 'wait_for_signal') {
        expect(cmd.nodeId).toBe('g');
        expect(cmd.timeoutMs).toBe(5000);
      }
    });

    it('follows normal edge on signal received', () => {
      const walker = new GraphWalker(gateDef, {});
      walker.next();
      walker.resolve({ signalReceived: true });
      const cmd = walker.next();
      expect(cmd.type).toBe('complete');
    });

    it('follows timeoutEdge on signal not received', () => {
      const walker = new GraphWalker(gateDef, {});
      walker.next();
      walker.resolve({ signalReceived: false });
      const cmd = walker.next();
      expect(cmd.type).toBe('complete');
    });

    it('emits fail when no timeoutEdge and signal not received', () => {
      const noTimeoutDef = makeDef({
        entrypoint: 'g',
        nodes: [
          { id: 'g', type: 'gate' },
          { id: 'ok', type: 'terminal' },
        ],
        edges: [{ from: 'g', to: 'ok' }],
      });
      const walker = new GraphWalker(noTimeoutDef, {});
      walker.next();
      walker.resolve({ signalReceived: false });
      const cmd = walker.next();
      expect(cmd.type).toBe('fail');
    });
  });

  describe('fork traversal', () => {
    it('emits fork command with branches and joinNode', () => {
      const def = makeDef({
        entrypoint: 'f',
        nodes: [
          { id: 'f', type: 'fork', branches: ['b1', 'b2'], joinNode: 'join' },
          { id: 'b1', type: 'action', handler: 'h1' },
          { id: 'b2', type: 'action', handler: 'h2' },
          { id: 'join', type: 'terminal' },
        ],
        edges: [
          { from: 'b1', to: 'join' },
          { from: 'b2', to: 'join' },
        ],
      });

      const walker = new GraphWalker(def, {});
      const cmd = walker.next();
      expect(cmd.type).toBe('fork');
      if (cmd.type === 'fork') {
        expect(cmd.branches).toEqual(['b1', 'b2']);
        expect(cmd.joinNode).toBe('join');
      }

      walker.resolve({ contextUpdates: { merged: true } });
      const cmd2 = walker.next();
      expect(cmd2.type).toBe('complete');
      if (cmd2.type === 'complete') {
        expect(cmd2.context.merged).toBe(true);
      }
    });
  });

  describe('workflow traversal', () => {
    it('emits execute_workflow command', () => {
      const def = makeDef({
        entrypoint: 'w',
        nodes: [
          { id: 'w', type: 'workflow', workflowRef: 'child-workflow', workflowVersion: 2, workflowInput: '{"code": ctx.code}' },
          { id: 'end', type: 'terminal' },
        ],
        edges: [{ from: 'w', to: 'end' }],
      });

      const walker = new GraphWalker(def, { code: 'hello()' });
      const cmd = walker.next();
      expect(cmd.type).toBe('execute_workflow');
      if (cmd.type === 'execute_workflow') {
        expect(cmd.workflowRef).toBe('child-workflow');
        expect(cmd.workflowVersion).toBe(2);
        expect(cmd.input).toEqual({ code: 'hello()' });
      }
    });
  });

  describe('setBounds', () => {
    it('emits complete when reaching stopNode without executing it', () => {
      const def = makeDef({
        entrypoint: 'a',
        nodes: [
          { id: 'a', type: 'action', handler: 'h1' },
          { id: 'b', type: 'action', handler: 'h2' },
          { id: 'c', type: 'terminal' },
        ],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
        ],
      });

      const walker = new GraphWalker(def, {});
      walker.setBounds('a', 'b');

      const cmd = walker.next();
      expect(cmd.type).toBe('execute_action');
      if (cmd.type === 'execute_action') {
        expect(cmd.nodeId).toBe('a');
      }

      walker.resolve({ contextUpdates: { done: true } });
      const cmd2 = walker.next();
      expect(cmd2.type).toBe('complete');
      if (cmd2.type === 'complete') {
        expect(cmd2.context.done).toBe(true);
      }
    });
  });

  describe('loop traversal', () => {
    it('allows looping back within limits', () => {
      const def = makeDef({
        entrypoint: 'gen',
        maxIterations: 3,
        nodes: [
          { id: 'gen', type: 'action', handler: 'generate' },
          { id: 'check', type: 'decision' },
          { id: 'done', type: 'terminal' },
        ],
        edges: [
          { from: 'gen', to: 'check' },
          { from: 'check', to: 'done', when: 'ctx.pass == true', priority: 0 },
          { from: 'check', to: 'gen', priority: 1 },
        ],
      });

      const walker = new GraphWalker(def, { pass: false });

      // Iteration 1
      let cmd = walker.next();
      expect(cmd.type).toBe('execute_action');
      walker.resolve({ contextUpdates: {} });

      // Decision -> loops back to gen
      cmd = walker.next();
      expect(cmd.type).toBe('execute_action');
      walker.resolve({ contextUpdates: {} });

      // Decision -> loops back to gen (iteration 3 of back-edge)
      cmd = walker.next();
      expect(cmd.type).toBe('execute_action');
      walker.resolve({ contextUpdates: { pass: true } });

      // Decision -> pass is true, goes to done
      cmd = walker.next();
      expect(cmd.type).toBe('complete');
    });
  });
```

- [ ] **Step 2: Run all walker tests**

Run: `cd libs/workflow-core && npx vitest run src/graph/walker.spec.ts`
Expected: PASS (all existing + new tests)

- [ ] **Step 3: Commit**

```bash
git add libs/workflow-core/src/graph/walker.spec.ts
git commit -m "test(workflow-core): add walker tests for gate, fork, workflow, setBounds, and loops"
```

---

## Chunk 5: Storage Layer

### Task 10: SQL migrations

**Files:**
- Create: `libs/workflow-core/src/storage/migrations/001_initial.sql`

- [ ] **Step 1: Write the migration SQL**

Create `libs/workflow-core/src/storage/migrations/001_initial.sql`:
```sql
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  definition  JSONB NOT NULL,
  is_template BOOLEAN NOT NULL DEFAULT false,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name, version)
);

CREATE TABLE IF NOT EXISTS workflow_executions (
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

- [ ] **Step 2: Commit**

```bash
git add libs/workflow-core/src/storage/
git commit -m "feat(workflow-core): add initial SQL migration for tenants, definitions, and executions"
```

---

### Task 11: Repository

**Files:**
- Create: `libs/workflow-core/src/storage/repository.ts`
- Create: `libs/workflow-core/src/storage/index.ts`
- Test: `libs/workflow-core/src/storage/repository.spec.ts`
- Modify: `libs/workflow-core/src/index.ts`

Note: Repository tests use a mock Postgres client since we don't spin up a database in unit tests. Integration tests against a real database are a separate concern for the host application.

- [ ] **Step 1: Write failing tests**

Create `libs/workflow-core/src/storage/repository.spec.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowRepository, type PgClient } from './repository';
import type { WorkflowGraph } from '../models';

function mockClient(): PgClient {
  return { query: vi.fn() };
}

const graph: WorkflowGraph = {
  entrypoint: 'start',
  nodes: [
    { id: 'start', type: 'action', handler: 'h' },
    { id: 'end', type: 'terminal' },
  ],
  edges: [{ from: 'start', to: 'end' }],
};

describe('WorkflowRepository', () => {
  let client: PgClient;
  let repo: WorkflowRepository;

  beforeEach(() => {
    client = mockClient();
    repo = new WorkflowRepository(client);
  });

  describe('createDefinition', () => {
    it('inserts a definition and returns the id', async () => {
      (client.query as any).mockResolvedValue({
        rows: [{ id: 'def-uuid' }],
      });

      const id = await repo.createDefinition({
        tenantId: 't1',
        name: 'my-workflow',
        version: 1,
        graph,
        isTemplate: false,
        createdBy: 'user',
      });

      expect(id).toBe('def-uuid');
      expect(client.query).toHaveBeenCalledTimes(1);
      const call = (client.query as any).mock.calls[0];
      expect(call[0]).toContain('INSERT INTO workflow_definitions');
      expect(call[1]).toContain('t1');
    });
  });

  describe('getByName', () => {
    it('fetches latest version by name when no version specified', async () => {
      (client.query as any).mockResolvedValue({
        rows: [{
          id: 'def-1',
          tenant_id: 't1',
          name: 'wf',
          version: 3,
          definition: graph,
          is_template: false,
          created_by: 'user',
          created_at: new Date(),
        }],
      });

      const def = await repo.getByName('t1', 'wf');
      expect(def).toBeDefined();
      expect(def!.version).toBe(3);
      const call = (client.query as any).mock.calls[0];
      expect(call[0]).toContain('ORDER BY version DESC');
    });

    it('fetches specific version when provided', async () => {
      (client.query as any).mockResolvedValue({
        rows: [{
          id: 'def-1',
          tenant_id: 't1',
          name: 'wf',
          version: 2,
          definition: graph,
          is_template: false,
          created_by: 'user',
          created_at: new Date(),
        }],
      });

      const def = await repo.getByName('t1', 'wf', 2);
      expect(def).toBeDefined();
      expect(def!.version).toBe(2);
      const call = (client.query as any).mock.calls[0];
      expect(call[0]).toContain('version = $');
    });

    it('returns null when not found', async () => {
      (client.query as any).mockResolvedValue({ rows: [] });
      const def = await repo.getByName('t1', 'nonexistent');
      expect(def).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd libs/workflow-core && npx vitest run src/storage/repository.spec.ts`
Expected: FAIL

- [ ] **Step 3: Write repository.ts**

Create `libs/workflow-core/src/storage/repository.ts`:
```typescript
import type { WorkflowDefinition, WorkflowGraph, WorkflowExecution } from '../models';

export interface PgClient {
  query(text: string, values?: any[]): Promise<{ rows: any[] }>;
}

export interface CreateDefinitionInput {
  tenantId: string;
  name: string;
  version: number;
  graph: WorkflowGraph;
  isTemplate: boolean;
  createdBy?: 'system' | 'user' | 'llm';
}

export class WorkflowRepository {
  constructor(private client: PgClient) {}

  async createDefinition(input: CreateDefinitionInput): Promise<string> {
    const result = await this.client.query(
      `INSERT INTO workflow_definitions (tenant_id, name, version, definition, is_template, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [input.tenantId, input.name, input.version, JSON.stringify(input.graph), input.isTemplate, input.createdBy ?? null],
    );
    return result.rows[0].id;
  }

  async getByName(tenantId: string, name: string, version?: number): Promise<WorkflowDefinition | null> {
    let result;
    if (version !== undefined) {
      result = await this.client.query(
        `SELECT * FROM workflow_definitions WHERE tenant_id = $1 AND name = $2 AND version = $3`,
        [tenantId, name, version],
      );
    } else {
      result = await this.client.query(
        `SELECT * FROM workflow_definitions WHERE tenant_id = $1 AND name = $2 ORDER BY version DESC LIMIT 1`,
        [tenantId, name],
      );
    }

    if (result.rows.length === 0) return null;
    return this.rowToDefinition(result.rows[0]);
  }

  async getById(id: string): Promise<WorkflowDefinition | null> {
    const result = await this.client.query(
      `SELECT * FROM workflow_definitions WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.rowToDefinition(result.rows[0]);
  }

  async createExecution(input: {
    tenantId: string;
    definitionId: string;
    params: Record<string, any>;
    parentExecutionId?: string;
  }): Promise<string> {
    const result = await this.client.query(
      `INSERT INTO workflow_executions (tenant_id, definition_id, params, parent_execution_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [input.tenantId, input.definitionId, JSON.stringify(input.params), input.parentExecutionId ?? null],
    );
    return result.rows[0].id;
  }

  async updateExecution(id: string, updates: {
    status?: string;
    currentNodeId?: string;
    context?: Record<string, any>;
    error?: string;
    dbosWorkflowId?: string;
  }): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.status) { sets.push(`status = $${idx++}`); values.push(updates.status); }
    if (updates.currentNodeId !== undefined) { sets.push(`current_node_id = $${idx++}`); values.push(updates.currentNodeId); }
    if (updates.context) { sets.push(`context = $${idx++}`); values.push(JSON.stringify(updates.context)); }
    if (updates.error !== undefined) { sets.push(`error = $${idx++}`); values.push(updates.error); }
    if (updates.dbosWorkflowId) { sets.push(`dbos_workflow_id = $${idx++}`); values.push(updates.dbosWorkflowId); }

    if (updates.status === 'running') { sets.push(`started_at = now()`); }
    if (updates.status === 'completed' || updates.status === 'failed') { sets.push(`completed_at = now()`); }

    if (sets.length === 0) return;

    values.push(id);
    await this.client.query(
      `UPDATE workflow_executions SET ${sets.join(', ')} WHERE id = $${idx}`,
      values,
    );
  }

  private rowToDefinition(row: any): WorkflowDefinition {
    const graph: WorkflowGraph = typeof row.definition === 'string'
      ? JSON.parse(row.definition)
      : row.definition;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      version: row.version,
      isTemplate: row.is_template,
      createdBy: row.created_by,
      createdAt: row.created_at,
      entrypoint: graph.entrypoint,
      nodes: graph.nodes,
      edges: graph.edges,
      maxIterations: graph.maxIterations,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd libs/workflow-core && npx vitest run src/storage/repository.spec.ts`
Expected: PASS

- [ ] **Step 5: Create storage/index.ts and update exports**

Create `libs/workflow-core/src/storage/index.ts`:
```typescript
export { WorkflowRepository } from './repository';
export type { PgClient, CreateDefinitionInput } from './repository';
```

Update `libs/workflow-core/src/index.ts`:
```typescript
export * from './models';
export * from './cel';
export * from './validation';
export * from './graph';
export * from './storage';
```

- [ ] **Step 6: Commit**

```bash
git add libs/workflow-core/src/storage/ libs/workflow-core/src/index.ts
git commit -m "feat(workflow-core): add Postgres repository for definitions and executions"
```

---

## Chunk 6: Integration Validation + Final Wiring

### Task 12: Combined validation pipeline

**Files:**
- Create: `libs/workflow-core/src/validation/pipeline.ts`
- Test: `libs/workflow-core/src/validation/pipeline.spec.ts`
- Modify: `libs/workflow-core/src/validation/index.ts`

- [ ] **Step 1: Write failing tests**

Create `libs/workflow-core/src/validation/pipeline.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { validateWorkflowGraph } from './pipeline';
import type { WorkflowGraph } from '../models';

describe('validateWorkflowGraph', () => {
  it('passes a fully valid graph', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action', handler: 'h', input: '{"x": ctx.x}' },
        { id: 'd', type: 'decision' },
        { id: 'y', type: 'terminal' },
        { id: 'n', type: 'terminal' },
      ],
      edges: [
        { from: 'a', to: 'd' },
        { from: 'd', to: 'y', when: 'ctx.x > 0', priority: 0 },
        { from: 'd', to: 'n', priority: 1 },
      ],
    };
    const result = validateWorkflowGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('collects errors from all validation layers', () => {
    const graph: WorkflowGraph = {
      entrypoint: '',
      nodes: [],
      edges: [],
    };
    const result = validateWorkflowGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('stops early if schema validation fails', () => {
    const graph: WorkflowGraph = {
      entrypoint: 'a',
      nodes: [
        { id: 'a', type: 'action' }, // missing handler
        { id: 'b', type: 'terminal' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const result = validateWorkflowGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/handler/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd libs/workflow-core && npx vitest run src/validation/pipeline.spec.ts`
Expected: FAIL

- [ ] **Step 3: Write pipeline.ts**

Create `libs/workflow-core/src/validation/pipeline.ts`:
```typescript
import type { WorkflowGraph } from '../models';
import type { ValidationResult } from './schema';
import { validateSchema } from './schema';
import { validateGraph } from '../graph/validator';
import { validateCelExpressions } from '../cel/validator';

export function validateWorkflowGraph(graph: WorkflowGraph): ValidationResult {
  // Layer 1: Schema
  const schemaResult = validateSchema(graph);
  if (!schemaResult.valid) return schemaResult;

  // Layer 2: Graph structure
  const graphResult = validateGraph(graph);
  if (!graphResult.valid) return graphResult;

  // Layer 3: CEL expressions
  const celResult = validateCelExpressions(graph);
  if (!celResult.valid) return celResult;

  return { valid: true, errors: [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd libs/workflow-core && npx vitest run src/validation/pipeline.spec.ts`
Expected: PASS

- [ ] **Step 5: Update exports**

Update `libs/workflow-core/src/validation/index.ts`:
```typescript
export { validateSchema } from './schema';
export { validateWorkflowGraph } from './pipeline';
export type { ValidationResult } from './schema';
```

- [ ] **Step 6: Run all tests**

Run: `cd libs/workflow-core && npx vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add libs/workflow-core/src/validation/
git commit -m "feat(workflow-core): add combined validation pipeline (schema + graph + CEL)"
```

---

### Task 13: Verify Nx build and test targets

- [ ] **Step 1: Run Nx test**

Run: `./nx test workflow-core`
Expected: all tests pass

- [ ] **Step 2: Run Nx build**

Run: `./nx build workflow-core`
Expected: builds successfully to `dist/libs/workflow-core`

- [ ] **Step 3: Verify affected works**

Run: `./nx affected -t test --base=main`
Expected: shows `workflow-core` as affected

- [ ] **Step 4: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore(workflow-core): finalize build and test configuration"
```
