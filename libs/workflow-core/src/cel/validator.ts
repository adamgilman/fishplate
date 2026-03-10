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
