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
