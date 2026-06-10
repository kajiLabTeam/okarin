-- migrate:up

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  global_role text NOT NULL DEFAULT 'none',
  password_must_change boolean NOT NULL DEFAULT true,
  password_changed_at timestamptz,
  temporary_password_expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_nonempty_chk
    CHECK (length(btrim(email)) > 0),
  CONSTRAINT users_display_name_nonempty_chk
    CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT users_password_hash_nonempty_chk
    CHECK (length(btrim(password_hash)) > 0),
  CONSTRAINT users_global_role_chk
    CHECK (global_role IN ('none', 'admin'))
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT organizations_name_nonempty_chk
    CHECK (length(btrim(name)) > 0)
);

CREATE TABLE organization_memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id),
  CONSTRAINT organization_memberships_role_chk
    CHECK (role IN ('member', 'manager'))
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  last_seen_at timestamptz,
  CONSTRAINT sessions_session_hash_nonempty_chk
    CHECK (length(btrim(session_hash)) > 0)
);

ALTER TABLE pedestrians
  ADD COLUMN user_id uuid UNIQUE REFERENCES users(id) ON DELETE RESTRICT;

CREATE INDEX organization_memberships_user_id_idx
  ON organization_memberships (user_id);

CREATE INDEX sessions_user_id_idx
  ON sessions (user_id);

CREATE INDEX sessions_expires_at_idx
  ON sessions (expires_at);

CREATE INDEX sessions_revoked_at_idx
  ON sessions (revoked_at);

CREATE TRIGGER set_updated_at_users
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_organizations
BEFORE UPDATE ON organizations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_organization_memberships
BEFORE UPDATE ON organization_memberships
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- migrate:down

DROP TRIGGER IF EXISTS set_updated_at_organization_memberships ON organization_memberships;
DROP TRIGGER IF EXISTS set_updated_at_organizations ON organizations;
DROP TRIGGER IF EXISTS set_updated_at_users ON users;

DROP INDEX IF EXISTS sessions_revoked_at_idx;
DROP INDEX IF EXISTS sessions_expires_at_idx;
DROP INDEX IF EXISTS sessions_user_id_idx;
DROP INDEX IF EXISTS organization_memberships_user_id_idx;

ALTER TABLE pedestrians
  DROP COLUMN IF EXISTS user_id;

DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS organization_memberships;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS users;
