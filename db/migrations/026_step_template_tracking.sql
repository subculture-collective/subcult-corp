-- 026: Step template performance tracking
-- Adds template_version to mission steps and a performance view.

ALTER TABLE ops_mission_steps ADD COLUMN IF NOT EXISTS template_version INT DEFAULT 1;

CREATE OR REPLACE VIEW step_template_performance AS
SELECT
    kind,
    template_version,
    COUNT(*) as total_runs,
    COUNT(*) FILTER (WHERE status = 'succeeded') as succeeded,
    ROUND(
        COUNT(*) FILTER (WHERE status = 'succeeded')::numeric
        / NULLIF(COUNT(*), 0) * 100
    ) as success_rate,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))::int as avg_duration_secs
FROM ops_mission_steps
WHERE status IN ('succeeded', 'failed')
GROUP BY kind, template_version;
