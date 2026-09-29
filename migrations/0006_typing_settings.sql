ALTER TABLE typing_results ADD COLUMN elapsed_ms INTEGER;
ALTER TABLE typing_results ADD COLUMN raw_characters INTEGER;
ALTER TABLE typing_results ADD COLUMN settings TEXT NOT NULL DEFAULT '{}';
