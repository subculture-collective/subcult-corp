-- 025: Context-scoped ACL grants
-- Temporary write-access grants tied to missions, sessions, or manual overrides.
-- Checked by file_write alongside the static WRITE_ACLS map.

CREATE TABLE IF NOT EXISTS ops_acl_grants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    TEXT NOT NULL,
    path_prefix TEXT NOT NULL,
    source      TEXT NOT NULL CHECK (source IN ('mission', 'session', 'manual')),
    source_id   UUID,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acl_grants_active
    ON ops_acl_grants (agent_id, expires_at);
