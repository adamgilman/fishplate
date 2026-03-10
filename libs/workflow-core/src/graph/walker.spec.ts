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
});
