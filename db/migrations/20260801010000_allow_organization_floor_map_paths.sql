-- migrate:up

ALTER TABLE floors
  DROP CONSTRAINT floors_image_object_path_format_chk;

ALTER TABLE floors
  ADD CONSTRAINT floors_image_object_path_format_chk
  CHECK (
    image_object_path ~ '^maps/[0-9a-fA-F-]+/[0-9a-fA-F-]+\.(svg|png)$'
    OR image_object_path ~ '^organizations/[0-9a-fA-F-]+/floors/[0-9a-fA-F-]+/map\.(svg|png)$'
  );

-- migrate:down

ALTER TABLE floors
  DROP CONSTRAINT floors_image_object_path_format_chk;

ALTER TABLE floors
  ADD CONSTRAINT floors_image_object_path_format_chk
  CHECK (image_object_path ~ '^maps/[0-9a-fA-F-]+/[0-9a-fA-F-]+\.(svg|png)$');
