-- V5: Connected Google account per family member
CREATE TABLE google_connections (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_member_id  UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    credentials_id    UUID REFERENCES google_credentials(id) ON DELETE SET NULL,
    google_account_id VARCHAR(255) NOT NULL,
    email             VARCHAR(320) NOT NULL,
    access_token      TEXT,
    refresh_token     TEXT NOT NULL,
    token_expires_at  TIMESTAMP WITH TIME ZONE,
    scopes            JSONB NOT NULL DEFAULT '[]'::jsonb,
    status            VARCHAR(20) NOT NULL DEFAULT 'active',
    connected_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_synced_at    TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX idx_google_connections_account ON google_connections (google_account_id);
CREATE INDEX idx_google_connections_member ON google_connections (family_member_id);
