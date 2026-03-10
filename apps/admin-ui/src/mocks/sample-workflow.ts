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
