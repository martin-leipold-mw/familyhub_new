-- V2: Extend family_members for Stufe 2 (role, birth date, soft-delete, avatar bytes)

ALTER TABLE family_members ADD COLUMN role          VARCHAR(10) NOT NULL DEFAULT 'child';
ALTER TABLE family_members ADD COLUMN date_of_birth DATE;
ALTER TABLE family_members ADD COLUMN is_active     BOOLEAN     NOT NULL DEFAULT TRUE;
ALTER TABLE family_members ADD COLUMN avatar_data   BYTEA;

COMMENT ON COLUMN family_members.role IS 'parent | child';
COMMENT ON COLUMN family_members.is_active IS 'Soft-delete flag; false = removed from UI';
COMMENT ON COLUMN family_members.avatar_data IS 'Client-compressed JPEG bytes, served via GET /members/{id}/avatar';
