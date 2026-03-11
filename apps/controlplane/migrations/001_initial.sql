CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  definition  JSONB NOT NULL,
  is_template BOOLEAN NOT NULL DEFAULT false,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name, version)
);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  definition_id       UUID NOT NULL REFERENCES workflow_definitions(id),
  parent_execution_id UUID REFERENCES workflow_executions(id),
  dbos_workflow_id    TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'completed', 'failed', 'waiting')),
  current_node_id     TEXT,
  context             JSONB NOT NULL DEFAULT '{}',
  params              JSONB NOT NULL DEFAULT '{}',
  error               TEXT,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

