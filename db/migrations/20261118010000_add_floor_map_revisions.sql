-- migrate:up
ALTER TABLE floors ADD CONSTRAINT floors_id_organization_unique UNIQUE (id, organization_id);
CREATE TABLE floor_map_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id uuid NOT NULL,
  FOREIGN KEY (floor_id, organization_id) REFERENCES floors(id, organization_id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  revision integer NOT NULL CHECK (revision > 0),
  image_object_path text NOT NULL,
  map_width_px integer,
  map_height_px integer,
  scale double precision CHECK (scale > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_beacons jsonb,
  beacons_need_review boolean NOT NULL DEFAULT false,
  UNIQUE (floor_id, revision),
  UNIQUE (id, floor_id, organization_id),
  CHECK ((map_width_px IS NULL) = (map_height_px IS NULL)),
  CHECK (map_width_px IS NULL OR (map_width_px > 0 AND map_height_px > 0 AND map_width_px <= 20000 AND map_height_px <= 20000 AND map_width_px::bigint * map_height_px <= 100000000)),
  CHECK (image_object_path ~ '^(maps/[0-9a-fA-F-]+/[0-9a-fA-F-]+|organizations/[0-9a-fA-F-]+/floors/[0-9a-fA-F-]+/(map|revisions/[0-9a-fA-F-]+/map))\.(png|svg)$')
);
ALTER TABLE floors ADD COLUMN current_map_revision_id uuid, ADD COLUMN initial_map_revision_id uuid;
INSERT INTO floor_map_revisions (floor_id, organization_id, revision, image_object_path, map_width_px, map_height_px, scale, created_at)
SELECT id, organization_id, 1, image_object_path, map_width_px, map_height_px, scale, created_at FROM floors;
UPDATE floors f SET current_map_revision_id = r.id, initial_map_revision_id = r.id FROM floor_map_revisions r WHERE r.floor_id = f.id;
ALTER TABLE floors
  ADD CONSTRAINT floors_current_map_revision_fk FOREIGN KEY (current_map_revision_id, id, organization_id) REFERENCES floor_map_revisions(id, floor_id, organization_id),
  ADD CONSTRAINT floors_initial_map_revision_fk FOREIGN KEY (initial_map_revision_id, id, organization_id) REFERENCES floor_map_revisions(id, floor_id, organization_id);
ALTER TABLE floors DROP CONSTRAINT floors_image_object_path_format_chk;
ALTER TABLE floors ADD CONSTRAINT floors_image_object_path_format_chk CHECK (image_object_path ~ '^(maps/[0-9a-fA-F-]+/[0-9a-fA-F-]+|organizations/[0-9a-fA-F-]+/floors/[0-9a-fA-F-]+/(map|revisions/[0-9a-fA-F-]+/map))\.(png|svg)$');

-- Keep the floor API's current-image fields as an atomic projection. Version
-- creation also applies to scale-only updates and existing SQL clients.
CREATE FUNCTION version_floor_map() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_id uuid; next_revision integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.image_object_path, NEW.scale) IS NOT DISTINCT FROM (OLD.image_object_path, OLD.scale) THEN
      RETURN NEW;
    END IF;
    UPDATE floor_map_revisions SET archived_beacons = COALESCE((SELECT jsonb_agg(to_jsonb(b)) FROM beacons b WHERE b.floor_id = OLD.id AND b.deleted_at IS NULL), '[]'::jsonb) WHERE id = OLD.current_map_revision_id;
    SELECT COALESCE(max(revision), 0) + 1 INTO next_revision FROM floor_map_revisions WHERE floor_id = NEW.id;
  ELSE
    next_revision := 1;
  END IF;
  INSERT INTO floor_map_revisions (floor_id, organization_id, revision, image_object_path, map_width_px, map_height_px, scale, beacons_need_review)
  VALUES (NEW.id, NEW.organization_id, next_revision, NEW.image_object_path, NEW.map_width_px, NEW.map_height_px, NEW.scale,
    CASE WHEN TG_OP = 'UPDATE' THEN CASE WHEN NEW.image_object_path IS DISTINCT FROM OLD.image_object_path THEN true ELSE (SELECT beacons_need_review FROM floor_map_revisions WHERE id = OLD.current_map_revision_id) END ELSE false END)
  RETURNING id INTO revision_id;
  UPDATE floors SET current_map_revision_id = revision_id, initial_map_revision_id = COALESCE(initial_map_revision_id, revision_id) WHERE id = NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER version_floor_map AFTER INSERT OR UPDATE OF image_object_path, scale ON floors FOR EACH ROW EXECUTE FUNCTION version_floor_map();

ALTER TABLE recordings ADD COLUMN floor_map_revision_id uuid;
UPDATE recordings r SET floor_map_revision_id = f.initial_map_revision_id FROM floors f WHERE f.id = r.floor_id;
ALTER TABLE recordings ALTER COLUMN floor_map_revision_id SET NOT NULL, ALTER COLUMN floor_map_revision_id SET DEFAULT NULL;
ALTER TABLE recordings ADD CONSTRAINT recordings_map_revision_fk FOREIGN KEY (floor_map_revision_id, floor_id, organization_id) REFERENCES floor_map_revisions(id, floor_id, organization_id);
CREATE FUNCTION default_recording_map_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.floor_map_revision_id IS NULL THEN
    SELECT initial_map_revision_id INTO NEW.floor_map_revision_id FROM floors WHERE id = NEW.floor_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER default_recording_map_revision BEFORE INSERT ON recordings FOR EACH ROW EXECUTE FUNCTION default_recording_map_revision();
ALTER TABLE trajectories ADD COLUMN floor_map_revision_id uuid;
UPDATE trajectories t SET floor_map_revision_id = r.floor_map_revision_id FROM recordings r WHERE r.id = t.recording_id;
ALTER TABLE trajectories ALTER COLUMN floor_map_revision_id SET NOT NULL, ALTER COLUMN floor_map_revision_id SET DEFAULT NULL;
ALTER TABLE trajectories ADD CONSTRAINT trajectories_map_revision_fk FOREIGN KEY (floor_map_revision_id, floor_id, organization_id) REFERENCES floor_map_revisions(id, floor_id, organization_id);
CREATE FUNCTION default_trajectory_map_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.floor_map_revision_id IS NULL THEN
    SELECT floor_map_revision_id INTO NEW.floor_map_revision_id FROM recordings WHERE id = NEW.recording_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER default_trajectory_map_revision BEFORE INSERT ON trajectories FOR EACH ROW EXECUTE FUNCTION default_trajectory_map_revision();
ALTER TABLE analysis_runs ADD COLUMN floor_map_revision_id uuid;
UPDATE analysis_runs a SET floor_map_revision_id = f.initial_map_revision_id FROM floors f WHERE f.id = a.floor_id;
ALTER TABLE analysis_runs ADD CONSTRAINT analysis_runs_map_revision_fk FOREIGN KEY (floor_map_revision_id, floor_id, organization_id) REFERENCES floor_map_revisions(id, floor_id, organization_id);

CREATE FUNCTION protect_floor_map_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.floor_id, NEW.organization_id, NEW.revision, NEW.image_object_path, NEW.scale, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.floor_id, OLD.organization_id, OLD.revision, OLD.image_object_path, OLD.scale, OLD.created_at)
     OR (OLD.map_width_px IS NOT NULL AND (NEW.map_width_px, NEW.map_height_px) IS DISTINCT FROM (OLD.map_width_px, OLD.map_height_px))
     OR (OLD.archived_beacons IS NOT NULL AND NEW.archived_beacons IS DISTINCT FROM OLD.archived_beacons) THEN
    RAISE EXCEPTION 'floor map revision is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_floor_map_revision BEFORE UPDATE ON floor_map_revisions FOR EACH ROW EXECUTE FUNCTION protect_floor_map_revision();

-- migrate:down
DROP TRIGGER protect_floor_map_revision ON floor_map_revisions;
DROP FUNCTION protect_floor_map_revision();
ALTER TABLE analysis_runs DROP COLUMN floor_map_revision_id;
DROP TRIGGER default_trajectory_map_revision ON trajectories;
DROP FUNCTION default_trajectory_map_revision();
ALTER TABLE trajectories DROP COLUMN floor_map_revision_id;
DROP TRIGGER default_recording_map_revision ON recordings;
DROP FUNCTION default_recording_map_revision();
ALTER TABLE recordings DROP COLUMN floor_map_revision_id;
DROP TRIGGER version_floor_map ON floors;
DROP FUNCTION version_floor_map();
ALTER TABLE floors DROP COLUMN current_map_revision_id, DROP COLUMN initial_map_revision_id;
DROP TABLE floor_map_revisions;
ALTER TABLE floors DROP CONSTRAINT floors_id_organization_unique;
