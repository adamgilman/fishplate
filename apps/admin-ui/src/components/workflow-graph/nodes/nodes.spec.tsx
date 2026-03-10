import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ActionNode } from './action-node';
import { DecisionNode } from './decision-node';
import { TerminalNode } from './terminal-node';
import type { WorkflowNodeData } from '@/lib/graph-layout';

function makeNodeData(overrides: Partial<WorkflowNodeData> = {}): WorkflowNodeData {
  return {
    definition: { id: 'test-node', type: 'action', handler: 'my_handler' },
    executionState: { nodeId: 'test-node', status: 'completed' },
    isEntrypoint: false,
    edges: [],
    edgeStates: [],
    ...overrides,
  };
}

function renderInFlow(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}

// Cast helper to avoid passing all required NodeProps fields (zIndex, selected, etc.)
function nodeProps(id: string, data: WorkflowNodeData, type: string) {
  return { id, data, type } as any;
}

describe('ActionNode', () => {
  it('renders handler name', () => {
    renderInFlow(<ActionNode {...nodeProps('test', makeNodeData(), 'action')} />);
    expect(screen.getByText('my_handler')).toBeInTheDocument();
  });
});

describe('TerminalNode', () => {
  it('renders "Start" when isEntrypoint is true', () => {
    const data = makeNodeData({ isEntrypoint: true, definition: { id: 'start', type: 'terminal' } });
    renderInFlow(<TerminalNode {...nodeProps('start', data, 'terminal')} />);
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('renders "End" when isEntrypoint is false', () => {
    const data = makeNodeData({ isEntrypoint: false, definition: { id: 'end', type: 'terminal' } });
    renderInFlow(<TerminalNode {...nodeProps('end', data, 'terminal')} />);
    expect(screen.getByText('End')).toBeInTheDocument();
  });
});

describe('DecisionNode', () => {
  it('renders node id and condition count', () => {
    const data = makeNodeData({
      definition: { id: 'review', type: 'decision' },
      edges: [{ from: 'review', to: 'deploy', when: 'ctx.ok == true' }],
    });
    renderInFlow(<DecisionNode {...nodeProps('review', data, 'decision')} />);
    expect(screen.getByText('review')).toBeInTheDocument();
    expect(screen.getByText('1 condition')).toBeInTheDocument();
  });
});
