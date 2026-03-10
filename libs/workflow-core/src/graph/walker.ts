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
            if (this.pendingError) {
              const error = this.pendingError;
              this.pendingError = null;
              return { type: 'fail', nodeId: node.id, reason: error };
            }
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
