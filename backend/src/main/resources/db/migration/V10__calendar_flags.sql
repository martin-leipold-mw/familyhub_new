-- V10: shared/write-target flags per calendar subscription
ALTER TABLE calendar_subscriptions
    ADD COLUMN is_shared       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN is_write_target BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: the existing Google primary calendar becomes the write target per connection.
UPDATE calendar_subscriptions SET is_write_target = TRUE WHERE is_primary = TRUE;

-- Exactly one write target per connection.
CREATE UNIQUE INDEX idx_calendar_subscriptions_write_target
    ON calendar_subscriptions (connection_id) WHERE is_write_target = TRUE;
