-- migrate:up

ALTER TABLE buildings
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE floors
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE pedestrians
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE recordings
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE trajectories
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

CREATE INDEX buildings_organization_id_idx
  ON buildings (organization_id);

CREATE INDEX floors_organization_id_idx
  ON floors (organization_id);

CREATE INDEX pedestrians_organization_id_idx
  ON pedestrians (organization_id);

CREATE INDEX recordings_organization_id_idx
  ON recordings (organization_id);

CREATE INDEX trajectories_organization_id_idx
  ON trajectories (organization_id);

-- migrate:down

DROP INDEX IF EXISTS trajectories_organization_id_idx;
DROP INDEX IF EXISTS recordings_organization_id_idx;
DROP INDEX IF EXISTS pedestrians_organization_id_idx;
DROP INDEX IF EXISTS floors_organization_id_idx;
DROP INDEX IF EXISTS buildings_organization_id_idx;

ALTER TABLE trajectories
  DROP COLUMN IF EXISTS organization_id;

ALTER TABLE recordings
  DROP COLUMN IF EXISTS organization_id;

ALTER TABLE pedestrians
  DROP COLUMN IF EXISTS organization_id;

ALTER TABLE floors
  DROP COLUMN IF EXISTS organization_id;

ALTER TABLE buildings
  DROP COLUMN IF EXISTS organization_id;
