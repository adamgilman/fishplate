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
