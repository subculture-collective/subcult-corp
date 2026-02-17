-- 039: Fix auto_approve allowed_step_kinds to match current StepKind enum
-- The original seed used stale step kind names (draft_tweet, crawl, analyze, etc.)
-- that don't match the current type system, so nothing was ever auto-approved.

UPDATE ops_policy
SET value = jsonb_set(
    value,
    '{allowed_step_kinds}',
    '["research_topic", "scan_signals", "draft_essay", "draft_thread", "audit_system", "patch_code", "distill_insight", "document_lesson", "critique_content", "consolidate_memory", "memory_archaeology"]'::jsonb
),
updated_at = NOW()
WHERE key = 'auto_approve';
