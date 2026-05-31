-- migrate:up

ALTER TABLE pedestrians
  ADD COLUMN display_name text;

UPDATE pedestrians
SET display_name = 'Unnamed pedestrian'
WHERE display_name IS NULL;

ALTER TABLE pedestrians
  ALTER COLUMN display_name SET NOT NULL;

ALTER TABLE pedestrians
  ADD CONSTRAINT pedestrians_display_name_nonempty_chk
    CHECK (length(btrim(display_name)) > 0);

-- migrate:down

ALTER TABLE pedestrians
  DROP CONSTRAINT IF EXISTS pedestrians_display_name_nonempty_chk;

ALTER TABLE pedestrians
  DROP COLUMN IF EXISTS display_name;
