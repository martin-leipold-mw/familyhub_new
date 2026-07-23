-- V4: OAuth client credentials (one row = one Google Cloud project / OAuth client)
CREATE TABLE google_credentials (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     TEXT         NOT NULL,   -- AES-GCM encrypted, Base64
    client_secret TEXT         NOT NULL,   -- AES-GCM encrypted, Base64
    redirect_uri  VARCHAR(512) NOT NULL,
    nickname      VARCHAR(100) NOT NULL,
    is_primary    BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_google_credentials_single_primary
    ON google_credentials (is_primary) WHERE is_primary = TRUE;
