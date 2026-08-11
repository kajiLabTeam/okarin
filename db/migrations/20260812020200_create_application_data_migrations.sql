-- migrate:up

CREATE TABLE application_data_migrations (
  name text PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT NOW(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT application_data_migrations_name_nonempty_chk
    CHECK (length(btrim(name)) > 0)
);

-- migrate:down

DROP TABLE IF EXISTS application_data_migrations;
