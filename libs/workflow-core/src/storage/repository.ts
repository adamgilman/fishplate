import type { WorkflowDefinition, WorkflowGraph, WorkflowExecution } from '../models';

export interface PgClient {
  query(text: string, values?: any[]): Promise<{ rows: any[] }>;
}

export interface CreateDefinitionInput {
  tenantId: string;
  name: string;
  version: number;
  graph: WorkflowGraph;
  isTemplate: boolean;
  createdBy?: 'system' | 'user' | 'llm';
}

export class WorkflowRepository {
  constructor(private client: PgClient) {}

  async createDefinition(input: CreateDefinitionInput): Promise<string> {
    const result = await this.client.query(
      `INSERT INTO workflow_definitions (tenant_id, name, version, definition, is_template, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [input.tenantId, input.name, input.version, JSON.stringify(input.graph), input.isTemplate, input.createdBy ?? null],
    );
    return result.rows[0].id;
  }

  async getByName(tenantId: string, name: string, version?: number): Promise<WorkflowDefinition | null> {
    let result;
    if (version !== undefined) {
      result = await this.client.query(
        `SELECT * FROM workflow_definitions WHERE tenant_id = $1 AND name = $2 AND version = $3`,
        [tenantId, name, version],
      );
    } else {
      result = await this.client.query(
        `SELECT * FROM workflow_definitions WHERE tenant_id = $1 AND name = $2 ORDER BY version DESC LIMIT 1`,
        [tenantId, name],
      );
    }

    if (result.rows.length === 0) return null;
    return this.rowToDefinition(result.rows[0]);
  }

  async getById(id: string): Promise<WorkflowDefinition | null> {
    const result = await this.client.query(
      `SELECT * FROM workflow_definitions WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.rowToDefinition(result.rows[0]);
  }

  async createExecution(input: {
    tenantId: string;
    definitionId: string;
    params: Record<string, any>;
    parentExecutionId?: string;
  }): Promise<string> {
    const result = await this.client.query(
      `INSERT INTO workflow_executions (tenant_id, definition_id, params, parent_execution_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [input.tenantId, input.definitionId, JSON.stringify(input.params), input.parentExecutionId ?? null],
    );
    return result.rows[0].id;
  }

  async updateExecution(id: string, updates: {
    status?: string;
    currentNodeId?: string;
    context?: Record<string, any>;
    error?: string;
    dbosWorkflowId?: string;
  }): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.status) { sets.push(`status = $${idx++}`); values.push(updates.status); }
    if (updates.currentNodeId !== undefined) { sets.push(`current_node_id = $${idx++}`); values.push(updates.currentNodeId); }
    if (updates.context) { sets.push(`context = $${idx++}`); values.push(JSON.stringify(updates.context)); }
    if (updates.error !== undefined) { sets.push(`error = $${idx++}`); values.push(updates.error); }
    if (updates.dbosWorkflowId) { sets.push(`dbos_workflow_id = $${idx++}`); values.push(updates.dbosWorkflowId); }

    if (updates.status === 'running') { sets.push(`started_at = now()`); }
    if (updates.status === 'completed' || updates.status === 'failed') { sets.push(`completed_at = now()`); }

    if (sets.length === 0) return;

    values.push(id);
    await this.client.query(
      `UPDATE workflow_executions SET ${sets.join(', ')} WHERE id = $${idx}`,
      values,
    );
  }

  private rowToDefinition(row: any): WorkflowDefinition {
    const graph: WorkflowGraph = typeof row.definition === 'string'
      ? JSON.parse(row.definition)
      : row.definition;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      version: row.version,
      isTemplate: row.is_template,
      createdBy: row.created_by,
      createdAt: row.created_at,
      entrypoint: graph.entrypoint,
      nodes: graph.nodes,
      edges: graph.edges,
      maxIterations: graph.maxIterations,
    };
  }
}
