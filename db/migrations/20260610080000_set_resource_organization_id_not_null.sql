-- migrate:up

ALTER TABLE buildings
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE floors
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE pedestrians
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE recordings
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE trajectories
  ALTER COLUMN organization_id SET NOT NULL;

-- migrate:down

ALTER TABLE trajectories
  ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE recordings
  ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE pedestrians
  ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE floors
  ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE buildings
  ALTER COLUMN organization_id DROP NOT NULL;
