-- V1: Initial schema — settings and family_members foundation
-- Additional domain tables added in subsequent migrations (V2+)

CREATE TABLE settings (
    key        VARCHAR(255) PRIMARY KEY,
    value      TEXT         NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE settings IS 'Key-value store for runtime configuration managed via Setup Wizard';

CREATE TABLE family_members (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    color      VARCHAR(7),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE family_members IS 'Members of the family. No passwords — identified by selection at action time.';
