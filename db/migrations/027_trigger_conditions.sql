-- 027: Declarative trigger conditions
-- Adds an optional JSONB condition column to trigger rules.
-- When present, the condition is evaluated by condition-evaluator.ts
-- instead of the hardcoded switch/case in triggers.ts.

ALTER TABLE ops_trigger_rules ADD COLUMN IF NOT EXISTS condition JSONB;

-- Seed declarative conditions for simple triggers
-- (complex triggers like strategic_drift_check remain in code)

UPDATE ops_trigger_rules
SET condition = '{"type": "query_count", "table": "ops_roundtable_sessions", "where": {"created_today": true, "status_in": ["completed", "running", "pending"]}, "operator": "==", "threshold": 0}'::jsonb
WHERE trigger_event = 'daily_roundtable' AND condition IS NULL;

UPDATE ops_trigger_rules
SET condition = '{"type": "query_count", "table": "ops_mission_proposals", "where": {"status": "pending"}, "operator": ">=", "threshold": 1}'::jsonb
WHERE trigger_event = 'proposal_ready' AND condition IS NULL;

UPDATE ops_trigger_rules
SET condition = '{"type": "query_count", "table": "ops_mission_steps", "where": {"status": "running", "updated_at_older_than_minutes": 120}, "operator": ">=", "threshold": 1}'::jsonb
WHERE trigger_event = 'work_stalled' AND condition IS NULL;

UPDATE ops_trigger_rules
SET condition = '{"type": "query_count", "table": "ops_agent_memory", "where": {"created_in_last_hours": 24, "confidence_gte": 0.5, "superseded_by_is_null": true}, "operator": ">=", "threshold": 3}'::jsonb
WHERE trigger_event = 'memory_consolidation_due' AND condition IS NULL;

UPDATE ops_trigger_rules
SET condition = '{"type": "event_exists", "kind": "mission_failed", "lookback_minutes": 60}'::jsonb
WHERE trigger_event = 'mission_failed' AND condition IS NULL;

UPDATE ops_trigger_rules
SET condition = '{"type": "event_exists", "kind": "mission_succeeded", "lookback_minutes": 60}'::jsonb
WHERE trigger_event = 'mission_milestone_hit' AND condition IS NULL;
