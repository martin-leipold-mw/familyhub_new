-- V7: Local event mirror
CREATE TABLE events (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id    UUID NOT NULL REFERENCES calendar_subscriptions(id) ON DELETE CASCADE,
    google_event_id    VARCHAR(1024) NOT NULL,
    google_calendar_id VARCHAR(255) NOT NULL,
    owner_member_id    UUID NOT NULL REFERENCES family_members(id),
    title              VARCHAR(1024) NOT NULL,
    description        TEXT,
    location           VARCHAR(1024),
    start_time         TIMESTAMP WITH TIME ZONE,
    end_time           TIMESTAMP WITH TIME ZONE,
    is_all_day         BOOLEAN NOT NULL DEFAULT FALSE,
    all_day_start      DATE,
    all_day_end        DATE,
    recurrence_id      VARCHAR(255),
    etag               VARCHAR(255),
    google_updated     TIMESTAMP WITH TIME ZONE,
    sync_status        VARCHAR(20) NOT NULL DEFAULT 'synced',
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (google_event_id, google_calendar_id)
);
CREATE INDEX idx_events_window ON events (start_time, end_time);
CREATE INDEX idx_events_owner ON events (owner_member_id);
