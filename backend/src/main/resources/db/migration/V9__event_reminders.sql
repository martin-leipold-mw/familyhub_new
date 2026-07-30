-- V9: Per-event reminder settings
ALTER TABLE events
    ADD COLUMN reminder_use_default BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN reminder_minutes INTEGER;
