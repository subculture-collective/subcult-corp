-- 024: Seed policy keys for runtime-configurable thresholds
-- Extends existing initiative_policy with new fields; adds recovery_policy and trigger_defaults.
-- roundtable_distillation already has the needed fields (min_confidence_threshold,
-- max_memories_per_conversation, max_action_items_per_conversation).

-- Add cooldown/memory fields to initiative_policy
UPDATE ops_policy
SET value = value || '{"cooldown_minutes": 120, "min_memories": 5, "min_confidence": 0.55}'::jsonb,
    updated_at = NOW()
WHERE key = 'initiative_policy'
  AND NOT (value ? 'cooldown_minutes');

-- New: recovery_policy
INSERT INTO ops_policy (key, value, description)
VALUES (
    'recovery_policy',
    '{"stale_threshold_minutes": 30}'::jsonb,
    'Thresholds for stale step recovery'
)
ON CONFLICT (key) DO NOTHING;

-- New: trigger_defaults
INSERT INTO ops_policy (key, value, description)
VALUES (
    'trigger_defaults',
    '{"stall_minutes": 120, "failure_rate_threshold": 0.3, "lookback_hours": 48}'::jsonb,
    'Default thresholds for trigger condition evaluation'
)
ON CONFLICT (key) DO NOTHING;
