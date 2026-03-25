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
