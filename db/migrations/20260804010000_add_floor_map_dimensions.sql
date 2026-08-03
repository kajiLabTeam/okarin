-- migrate:up

ALTER TABLE floors
  ADD COLUMN map_width_px integer,
  ADD COLUMN map_height_px integer,
  ADD CONSTRAINT floors_map_dimensions_presence_chk CHECK (
    (map_width_px IS NULL AND map_height_px IS NULL)
    OR (map_width_px IS NOT NULL AND map_height_px IS NOT NULL)
  ),
  ADD CONSTRAINT floors_map_dimensions_bounds_chk CHECK (
    map_width_px IS NULL
    OR (
      map_width_px > 0
      AND map_height_px > 0
      AND map_width_px <= 20000
      AND map_height_px <= 20000
      AND map_width_px::bigint * map_height_px::bigint <= 100000000
    )
  );

-- migrate:down

ALTER TABLE floors
  DROP CONSTRAINT floors_map_dimensions_bounds_chk,
  DROP CONSTRAINT floors_map_dimensions_presence_chk,
  DROP COLUMN map_height_px,
  DROP COLUMN map_width_px;
