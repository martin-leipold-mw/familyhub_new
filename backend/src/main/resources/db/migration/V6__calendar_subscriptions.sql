-- V6: Selectable calendars per connection + incremental sync token
CREATE TABLE calendar_subscriptions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id      UUID NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
    google_calendar_id VARCHAR(255) NOT NULL,
    summary            VARCHAR(512) NOT NULL,
    background_color   VARCHAR(9),
    is_primary         BOOLEAN NOT NULL DEFAULT FALSE,
    is_selected        BOOLEAN NOT NULL DEFAULT FALSE,
    sync_token         TEXT,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (connection_id, google_calendar_id)
);
