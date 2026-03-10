import type { WorkflowDefinition } from '@fishplate/workflow-core';

interface DefinitionPanelProps {
  definition: WorkflowDefinition;
}

export function DefinitionPanel({ definition }: DefinitionPanelProps) {
  // Show the definition without runtime metadata
  const { id, tenantId, createdAt, isTemplate, ...display } = definition;

  return (
    <div className="w-96 border-r border-zinc-800 bg-zinc-900/50 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-200">Definition</h3>
      </div>
      <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-zinc-400 whitespace-pre-wrap break-all">
        {JSON.stringify(display, null, 2)}
      </pre>
    </div>
  );
}
