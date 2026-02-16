-- Agent scratchpad — persistent working memory document per agent
-- Agents can read/update this between context windows to maintain continuity.
CREATE TABLE IF NOT EXISTS ops_agent_scratchpad (
    agent_id TEXT PRIMARY KEY,
    content TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
