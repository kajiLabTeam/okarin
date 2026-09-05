-- migrate:up
ALTER TABLE recordings ADD COLUMN upload_failure jsonb;
CREATE TABLE beacons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), floor_id uuid NOT NULL REFERENCES floors(id),
  format_type text NOT NULL DEFAULT 'ibeacon', format_config jsonb NOT NULL, name text NOT NULL,
  pixel_x double precision NOT NULL, pixel_y double precision NOT NULL, note text, enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  CONSTRAINT beacons_format_type_chk CHECK (format_type = 'ibeacon'), CONSTRAINT beacons_format_config_object_chk CHECK (jsonb_typeof(format_config) = 'object'),
  CONSTRAINT beacons_name_nonempty_chk CHECK (length(btrim(name)) > 0), CONSTRAINT beacons_pixel_x_nonnegative_chk CHECK (pixel_x >= 0), CONSTRAINT beacons_pixel_y_nonnegative_chk CHECK (pixel_y >= 0)
);
CREATE INDEX beacons_floor_id_idx ON beacons (floor_id);
CREATE INDEX beacons_organization_id_idx ON beacons (organization_id);
CREATE UNIQUE INDEX beacons_org_active_name_key ON beacons (organization_id, lower(btrim(name))) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX beacons_org_active_ibeacon_identity_key ON beacons (organization_id, (format_config->>'uuid'), ((format_config->>'major')::integer), ((format_config->>'minor')::integer)) WHERE deleted_at IS NULL AND format_type = 'ibeacon';
CREATE TRIGGER set_updated_at_beacons BEFORE UPDATE ON beacons FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- migrate:down
ALTER TABLE recordings DROP COLUMN upload_failure;
DROP TABLE beacons;
