import type { WorkflowDefinition } from '@fishplate/workflow-core';
import type { WorkflowExecutionView } from '@/types/execution-view';
import { cn } from '@/lib/utils';

interface ContextInspectorProps {
  definition: WorkflowDefinition;
  execution: WorkflowExecutionView;
  selectedNodeId: string | null;
}

const statusColors: Record<string, string> = {
  completed: 'text-emerald-400',
  running: 'text-blue-400',
  failed: 'text-red-400',
  waiting: 'text-amber-400',
  pending: 'text-zinc-500',
};

export function ContextInspector({ definition, execution, selectedNodeId }: ContextInspectorProps) {
  if (!selectedNodeId) {
    return (
      <div className="w-80 border-l border-zinc-800 p-4 bg-zinc-900/50">
        <p className="text-sm text-zinc-500">Select a node to inspect</p>
      </div>
    );
  }

  const node = definition.nodes.find(n => n.id === selectedNodeId);
  const nodeState = execution.nodeStates.find(ns => ns.nodeId === selectedNodeId);
  const outgoingEdges = definition.edges.filter(e => e.from === selectedNodeId);
  const outgoingEdgeStates = execution.edgeStates.filter(e => e.from === selectedNodeId);

  if (!node || !nodeState) {
    return (
      <div className="w-80 border-l border-zinc-800 p-4 bg-zinc-900/50">
        <p className="text-sm text-zinc-500">Node not found</p>
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-zinc-800 p-4 bg-zinc-900/50 overflow-y-auto">
      <h3 className="text-sm font-semibold text-zinc-200 mb-3">Node Inspector</h3>

      <Section title="Identity">
        <Field label="ID" value={node.id} />
        <Field label="Type" value={node.type} />
        {node.handler && <Field label="Handler" value={node.handler} />}
        <Field label="Status">
          <span className={cn('font-medium', statusColors[nodeState.status])}>
            {nodeState.status}
          </span>
        </Field>
      </Section>

      <Section title="CEL Input">
        <div className="text-xs font-mono text-zinc-400 bg-zinc-800 rounded p-2 break-all">
          {node.input ?? 'No input expression'}
        </div>
      </Section>

      {nodeState.input && (
        <Section title="Evaluated Input">
          <JsonBlock data={nodeState.input} />
        </Section>
      )}

      {nodeState.output && (
        <Section title="Output">
          <JsonBlock data={nodeState.output} />
        </Section>
      )}

      {nodeState.error && (
        <Section title="Error">
          <div className="text-xs text-red-400 bg-red-500/10 rounded p-2">{nodeState.error}</div>
        </Section>
      )}

      {node.type === 'decision' && outgoingEdges.length > 0 && (
        <Section title="Conditions">
          {outgoingEdges.map((edge, i) => {
            const edgeState = outgoingEdgeStates.find(
              es => es.from === edge.from && es.to === edge.to && es.when === edge.when
            );
            return (
              <div key={i} className="flex items-start gap-2 mb-1">
                <span className={cn('text-xs', edgeState?.taken ? 'text-blue-400' : 'text-zinc-500')}>
                  {edgeState?.taken ? '→' : '○'}
                </span>
                <div className="text-xs">
                  <span className="text-zinc-400 font-mono">{edge.when ?? '(default)'}</span>
                  <span className="text-zinc-600 ml-1">→ {edge.to}</span>
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {node.type === 'fork' && node.branches && (
        <Section title="Branches">
          {node.branches.map(b => (
            <div key={b} className="text-xs text-zinc-400">{b}</div>
          ))}
        </Section>
      )}

      {node.type === 'workflow' && (
        <Section title="Child Workflow">
          <Field label="Ref" value={node.workflowRef ?? ''} />
          {node.workflowVersion && <Field label="Version" value={`v${node.workflowVersion}`} />}
        </Section>
      )}

      {nodeState.startedAt && (
        <Section title="Timing">
          <Field label="Started" value={new Date(nodeState.startedAt).toLocaleTimeString()} />
          {nodeState.completedAt && (
            <Field label="Completed" value={new Date(nodeState.completedAt).toLocaleTimeString()} />
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between text-xs mb-0.5">
      <span className="text-zinc-500">{label}</span>
      {children ?? <span className="text-zinc-300 font-mono">{value}</span>}
    </div>
  );
}

function JsonBlock({ data }: { data: Record<string, any> }) {
  return (
    <pre className="text-xs font-mono text-zinc-400 bg-zinc-800 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
