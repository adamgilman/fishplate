-- Demo tenant
INSERT INTO tenants (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Demo Tenant')
ON CONFLICT DO NOTHING;

-- Demo API key: SHA-256 of "fp_demo_key"
INSERT INTO api_keys (id, tenant_id, key_hash, name) VALUES
  ('00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000001',
   '57110c62de6ce26e3bcd67f495f59243722c7bd35920e211cc5b1279debd638a',
   'demo-key')
ON CONFLICT DO NOTHING;

-- Demo workflow definition
INSERT INTO workflow_definitions (id, tenant_id, name, version, definition) VALUES
  ('00000000-0000-0000-0000-000000000100',
   '00000000-0000-0000-0000-000000000001',
   'demo-workflow', 1,
   '{"entrypoint": "node-llm", "nodes": [
     {"id": "node-llm", "type": "action", "handler": "llm_generate"},
     {"id": "node-test", "type": "action", "handler": "run_tests"},
     {"id": "node-deploy", "type": "action", "handler": "deploy_service"}
   ], "edges": [
     {"from": "node-llm", "to": "node-test"},
     {"from": "node-test", "to": "node-deploy"}
   ]}'::jsonb)
ON CONFLICT DO NOTHING;

-- Demo workflow execution
INSERT INTO workflow_executions (id, tenant_id, definition_id, status, context) VALUES
  ('00000000-0000-0000-0000-000000001000',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000100',
   'running', '{}'::jsonb)
ON CONFLICT DO NOTHING;

-- Demo tasks
INSERT INTO tasks (id, tenant_id, execution_id, node_id, handler, input, status, deadline) VALUES
  ('00000000-0000-0000-0000-000000010001',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000001000',
   'node-llm', 'llm_generate',
   '{"task": "write a hello world function", "language": "go"}'::jsonb,
   'pending', now() + interval '5 minutes'),
  ('00000000-0000-0000-0000-000000010002',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000001000',
   'node-test', 'run_tests',
   '{"suite": "unit", "path": "./..."}'::jsonb,
   'pending', now() + interval '5 minutes'),
  ('00000000-0000-0000-0000-000000010003',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000001000',
   'node-deploy', 'deploy_service',
   '{"service": "api-gateway", "environment": "staging"}'::jsonb,
   'pending', now() + interval '5 minutes')
ON CONFLICT DO NOTHING;
