-- Create ops_discord_channels table if it doesn't exist
-- (Previously created manually; this migration makes it reproducible)

CREATE TABLE IF NOT EXISTS ops_discord_channels (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_channel_id  TEXT NOT NULL UNIQUE,
    discord_guild_id    TEXT NOT NULL,
    name                TEXT NOT NULL,
    category            TEXT NOT NULL,
    purpose             TEXT,
    webhook_id          TEXT,
    webhook_token       TEXT,
    enabled             BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discord_channels_name
    ON ops_discord_channels (name);
