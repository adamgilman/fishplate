import { useQuery } from '@tanstack/react-query';
import type { WorkflowDefinition } from '@fishplate/workflow-core';
import type { WorkflowExecutionView } from '@/types/execution-view';
import { sampleDefinition, sampleExecution } from '@/mocks/sample-workflow';

interface WorkflowData {
  definition: WorkflowDefinition;
  execution: WorkflowExecutionView;
}

export function useWorkflow(executionId: string) {
  return useQuery<WorkflowData>({
    queryKey: ['workflow-execution', executionId],
    queryFn: async () => {
      // Mock: return hardcoded data regardless of executionId
      return {
        definition: sampleDefinition,
        execution: sampleExecution,
      };
    },
  });
}
