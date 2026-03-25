import { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useWorkflow } from '@/hooks/use-workflow';
import { WorkflowGraph } from '@/components/workflow-graph/workflow-graph';
import { ContextInspector } from '@/components/context-inspector/context-inspector';
import { DefinitionPanel } from '@/components/definition-panel/definition-panel';

export function WorkflowView() {
  const { data, isLoading, error } = useWorkflow('exec-001');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showDefinition, setShowDefinition] = useState(true);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-500">Loading workflow...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-400">Failed to load workflow</p>
      </div>
    );
  }

  const { definition, execution } = data;

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">{definition.name}</h1>
          <p className="text-xs text-zinc-500">
            v{definition.version} — Execution: {execution.executionId}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowDefinition(v => !v)}
            className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded px-2 py-1"
          >
            {showDefinition ? 'Hide' : 'Show'} Definition
          </button>
          <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${
            execution.status === 'running' ? 'bg-blue-500 animate-pulse' :
            execution.status === 'completed' ? 'bg-emerald-500' :
            execution.status === 'failed' ? 'bg-red-500' :
            execution.status === 'waiting' ? 'bg-amber-500 animate-pulse' :
            'bg-zinc-500'
          }`} />
          <span className="text-sm text-zinc-400">{execution.status}</span>
        </div>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {showDefinition && <DefinitionPanel definition={definition} />}
        <div className="flex-1">
          <ReactFlowProvider>
            <WorkflowGraph
              definition={definition}
              execution={execution}
              onNodeSelect={setSelectedNodeId}
            />
          </ReactFlowProvider>
        </div>
        <ContextInspector
          definition={definition}
          execution={execution}
          selectedNodeId={selectedNodeId}
        />
      </div>
    </div>
  );
}
