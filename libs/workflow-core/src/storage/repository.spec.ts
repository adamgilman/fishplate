import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowRepository, type PgClient } from './repository';
import type { WorkflowGraph } from '../models';

function mockClient(): PgClient {
  return { query: vi.fn() };
}

const graph: WorkflowGraph = {
  entrypoint: 'start',
  nodes: [
    { id: 'start', type: 'action', handler: 'h' },
    { id: 'end', type: 'terminal' },
  ],
  edges: [{ from: 'start', to: 'end' }],
};

describe('WorkflowRepository', () => {
  let client: PgClient;
  let repo: WorkflowRepository;

  beforeEach(() => {
    client = mockClient();
    repo = new WorkflowRepository(client);
  });

  describe('createDefinition', () => {
    it('inserts a definition and returns the id', async () => {
      (client.query as any).mockResolvedValue({
        rows: [{ id: 'def-uuid' }],
      });

      const id = await repo.createDefinition({
        tenantId: 't1',
        name: 'my-workflow',
        version: 1,
        graph,
        isTemplate: false,
        createdBy: 'user',
      });

      expect(id).toBe('def-uuid');
      expect(client.query).toHaveBeenCalledTimes(1);
      const call = (client.query as any).mock.calls[0];
      expect(call[0]).toContain('INSERT INTO workflow_definitions');
      expect(call[1]).toContain('t1');
    });
  });

  describe('getByName', () => {
    it('fetches latest version by name when no version specified', async () => {
      (client.query as any).mockResolvedValue({
        rows: [{
          id: 'def-1',
          tenant_id: 't1',
          name: 'wf',
          version: 3,
          definition: graph,
          is_template: false,
          created_by: 'user',
          created_at: new Date(),
        }],
      });

      const def = await repo.getByName('t1', 'wf');
      expect(def).toBeDefined();
      expect(def!.version).toBe(3);
      const call = (client.query as any).mock.calls[0];
      expect(call[0]).toContain('ORDER BY version DESC');
    });

    it('fetches specific version when provided', async () => {
      (client.query as any).mockResolvedValue({
        rows: [{
          id: 'def-1',
          tenant_id: 't1',
          name: 'wf',
          version: 2,
          definition: graph,
          is_template: false,
          created_by: 'user',
          created_at: new Date(),
        }],
      });

      const def = await repo.getByName('t1', 'wf', 2);
      expect(def).toBeDefined();
      expect(def!.version).toBe(2);
      const call = (client.query as any).mock.calls[0];
      expect(call[0]).toContain('version = $');
    });

    it('returns null when not found', async () => {
      (client.query as any).mockResolvedValue({ rows: [] });
      const def = await repo.getByName('t1', 'nonexistent');
      expect(def).toBeNull();
    });
  });
});
