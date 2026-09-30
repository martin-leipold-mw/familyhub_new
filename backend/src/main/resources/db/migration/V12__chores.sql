-- V12: Haushaltsaufgaben (Ämtli) — Vorlagen und Zuweisungen.
--
-- Datumsloses Warteschlangen-Modell: eine Vorlage trägt ihren gesamten
-- Terminzustand in next_due_on. Es gibt keine Tagesinstanzen, keine
-- Fälligkeitsuhrzeit und keine Vorausgenerierung.
CREATE TABLE chores (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     VARCHAR(255) NOT NULL,
    icon                     VARCHAR(16)  NOT NULL,
    description              TEXT,
    interval_days            INT          NOT NULL CHECK (interval_days > 0),
    assignment_group         VARCHAR(10)  NOT NULL
                             CHECK (assignment_group IN ('parents', 'children', 'all')),
    points                   INT          NOT NULL DEFAULT 10,
    is_active                BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Der gesamte Terminzustand der Vorlage. Bei Anlage = heute.
    next_due_on              DATE         NOT NULL,
    -- Der Rotationszeiger. SET NULL, damit das harte Löschen eines Mitglieds
    -- die Vorlage nicht mitreißt — die Rotation beginnt dann wieder vorne.
    last_assigned_member_id  UUID REFERENCES family_members(id) ON DELETE SET NULL,
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE chore_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chore_id      UUID NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    member_id     UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    status        VARCHAR(10) NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'completed')),
    -- Eingefrorene Kopie der Vorlagenpunkte: die Gamification in Schritt 7
    -- braucht den Wert, der zum Zeitpunkt der Erledigung galt.
    points        INT  NOT NULL,
    assigned_on   DATE NOT NULL,
    completed_at  TIMESTAMP WITH TIME ZONE,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Der zentrale Constraint: eine Vorlage kann nie zweimal gleichzeitig offen
-- sein. Datenbankseitig, nicht anwendungsseitig — zwei parallele Ausgabeläufe
-- könnten sonst Dubletten erzeugen.
CREATE UNIQUE INDEX ux_chore_assignments_one_open
    ON chore_assignments (chore_id) WHERE status = 'open';

-- Für die Swimlane-Abfrage und das Zählen offener Zuweisungen je Mitglied.
CREATE INDEX idx_chore_assignments_member_status
    ON chore_assignments (member_id, status);
