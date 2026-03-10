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

  // Fork-specific structural checks first (branches and joinNode existence)
  // so fork errors surface before dangling edge / orphan errors
  for (const node of graph.nodes) {
    if (node.type === 'fork') {
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
    }
  }
  if (errors.length > 0) return { valid: false, errors };

  // Dangling edges (edges that reference non-existent nodes)
  // Collect all node ids referenced by fork joinNodes so we don't double-report them
  const forkJoinNodes = new Set<string>();
  for (const node of graph.nodes) {
    if (node.type === 'fork' && node.joinNode) {
      forkJoinNodes.add(node.joinNode);
    }
  }

  for (const edge of graph.edges) {
    if (!nodeMap.has(edge.from)) {
      errors.push(`edge references missing 'from' node '${edge.from}'`);
    }
    if (!nodeMap.has(edge.to)) {
      errors.push(`edge references missing 'to' node '${edge.to}' (dangling edge)`);
    }
  }
  if (errors.length > 0) return { valid: false, errors };

  // Gate timeoutEdge existence
  for (const node of graph.nodes) {
    if (node.type === 'gate' && node.timeoutEdge && !nodeMap.has(node.timeoutEdge)) {
      errors.push(`gate node '${node.id}' timeoutEdge references missing node '${node.timeoutEdge}'`);
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
        if (nodeMap.has(b)) {
          adjacency.get(node.id)!.add(b);
        }
      }
    }
    if (node.type === 'gate' && node.timeoutEdge && nodeMap.has(node.timeoutEdge)) {
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
        break;
      case 'fork':
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
