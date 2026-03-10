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
