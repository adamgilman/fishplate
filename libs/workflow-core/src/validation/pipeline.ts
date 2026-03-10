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
