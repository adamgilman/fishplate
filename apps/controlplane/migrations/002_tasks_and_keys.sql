CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  execution_id  UUID NOT NULL REFERENCES workflow_executions(id),
  node_id       TEXT NOT NULL,
  handler       TEXT NOT NULL,
  input         JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'claimed', 'completed', 'failed')),
  worker_id     TEXT,
  result        JSONB,
  error         TEXT,
  deadline      TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

CREATE INDEX idx_tasks_pending ON tasks (tenant_id, status, created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  key_hash    TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

