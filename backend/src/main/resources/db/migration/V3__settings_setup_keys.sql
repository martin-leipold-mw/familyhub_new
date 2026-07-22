-- V3: Seed setup-wizard control keys into the existing settings table

INSERT INTO settings (key, value) VALUES ('setup.completed', 'false');
INSERT INTO settings (key, value) VALUES ('setup.step', '1');
