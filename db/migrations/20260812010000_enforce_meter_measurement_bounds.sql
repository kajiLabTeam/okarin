-- migrate:up

ALTER TABLE organization_member_profiles
  ADD CONSTRAINT organization_member_profiles_height_meter_bounds_chk
  CHECK (height_meters IS NULL OR height_meters <= 3) NOT VALID,
  ADD CONSTRAINT organization_member_profiles_stride_meter_bounds_chk
  CHECK (stride_length_meters IS NULL OR stride_length_meters <= 3) NOT VALID;

ALTER TABLE pedestrians
  ADD CONSTRAINT pedestrians_height_meter_bounds_chk
  CHECK (height IS NULL OR (height > 0 AND height <= 3)) NOT VALID,
  ADD CONSTRAINT pedestrians_stride_meter_bounds_chk
  CHECK (stride_length IS NULL OR (stride_length > 0 AND stride_length <= 3)) NOT VALID;

-- migrate:down

ALTER TABLE pedestrians
  DROP CONSTRAINT pedestrians_stride_meter_bounds_chk,
  DROP CONSTRAINT pedestrians_height_meter_bounds_chk;

ALTER TABLE organization_member_profiles
  DROP CONSTRAINT organization_member_profiles_stride_meter_bounds_chk,
  DROP CONSTRAINT organization_member_profiles_height_meter_bounds_chk;
