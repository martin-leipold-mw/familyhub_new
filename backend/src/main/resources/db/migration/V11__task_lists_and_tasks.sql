-- V11: Google-Aufgabenlisten je Verbindung + Aufgaben
CREATE TABLE task_lists (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id        UUID NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
    google_task_list_id  VARCHAR(255) NOT NULL,
    title                VARCHAR(512) NOT NULL,
    is_selected          BOOLEAN NOT NULL DEFAULT FALSE,
    is_write_target      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (connection_id, google_task_list_id)
);

-- Höchstens eine Zielliste je Verbindung.
CREATE UNIQUE INDEX idx_task_lists_write_target
    ON task_lists (connection_id) WHERE is_write_target = TRUE;

CREATE TABLE tasks (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_list_id     UUID NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
    google_task_id   VARCHAR(255) NOT NULL,
    owner_member_id  UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    title            VARCHAR(500) NOT NULL,
    notes            TEXT,
    due_date         DATE,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'completed')),
    priority         VARCHAR(10) CHECK (priority IN ('low', 'medium', 'high')),
    completed_at     TIMESTAMP WITH TIME ZONE,
    etag             VARCHAR(255),
    google_updated   TIMESTAMP WITH TIME ZONE,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (task_list_id, google_task_id)
);

CREATE INDEX idx_tasks_owner    ON tasks (owner_member_id);
CREATE INDEX idx_tasks_due_date ON tasks (due_date);
CREATE INDEX idx_tasks_status   ON tasks (status);
