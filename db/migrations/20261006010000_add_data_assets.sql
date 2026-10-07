-- migrate:up

ALTER TABLE recordings ADD CONSTRAINT recordings_id_organization_key UNIQUE (id, organization_id);

CREATE TABLE data_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  data_type text NOT NULL,
  schema_version text NOT NULL,
  sample_count integer,
  started_at timestamptz,
  ended_at timestamptz,
  validation_status text NOT NULL DEFAULT 'pending',
  validation_error jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_assets_data_type_nonempty_chk CHECK (length(btrim(data_type)) > 0),
  CONSTRAINT data_assets_schema_version_nonempty_chk CHECK (length(btrim(schema_version)) > 0),
  CONSTRAINT data_assets_sample_count_chk CHECK (sample_count IS NULL OR sample_count >= 0),
  CONSTRAINT data_assets_time_range_chk CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at),
  CONSTRAINT data_assets_validation_status_chk CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  CONSTRAINT data_assets_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object')
);

ALTER TABLE data_assets ADD CONSTRAINT data_assets_id_organization_type_key
  UNIQUE (id, organization_id, data_type);

CREATE INDEX data_assets_organization_created_at_idx
  ON data_assets (organization_id, created_at DESC, id DESC);

CREATE TABLE data_asset_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_asset_id uuid NOT NULL REFERENCES data_assets(id) ON DELETE CASCADE,
  object_role text NOT NULL DEFAULT 'primary',
  format text NOT NULL,
  object_key text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint,
  checksum_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_asset_objects_role_nonempty_chk CHECK (length(btrim(object_role)) > 0),
  CONSTRAINT data_asset_objects_format_nonempty_chk CHECK (length(btrim(format)) > 0),
  CONSTRAINT data_asset_objects_content_type_nonempty_chk CHECK (length(btrim(content_type)) > 0),
  CONSTRAINT data_asset_objects_byte_size_chk CHECK (byte_size IS NULL OR byte_size > 0),
  CONSTRAINT data_asset_objects_checksum_sha256_chk CHECK (checksum_sha256 IS NULL OR length(btrim(checksum_sha256)) > 0)
);

CREATE UNIQUE INDEX data_asset_objects_asset_role_idx
  ON data_asset_objects (data_asset_id, object_role);

CREATE TABLE recording_data_assets (
  recording_id uuid NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  data_asset_id uuid NOT NULL,
  data_type text NOT NULL,
  client_asset_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recording_id, data_asset_id),
  CONSTRAINT recording_data_assets_data_type_nonempty_chk CHECK (length(btrim(data_type)) > 0)
);

ALTER TABLE recording_data_assets
  ADD CONSTRAINT recording_data_assets_recording_org_fk
  FOREIGN KEY (recording_id, organization_id) REFERENCES recordings(id, organization_id),
  ADD CONSTRAINT recording_data_assets_asset_org_type_fk
  FOREIGN KEY (data_asset_id, organization_id, data_type)
  REFERENCES data_assets(id, organization_id, data_type);

CREATE UNIQUE INDEX recording_data_assets_recording_data_type_idx
  ON recording_data_assets (recording_id, data_type);

CREATE INDEX recording_data_assets_asset_id_idx
  ON recording_data_assets (data_asset_id);

-- migrate:down

DROP TABLE recording_data_assets;
ALTER TABLE recordings DROP CONSTRAINT recordings_id_organization_key;
DROP TABLE data_asset_objects;
DROP TABLE data_assets;
