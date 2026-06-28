-- migrate:up

ALTER TABLE users
  ADD COLUMN status text;

UPDATE users
SET status = CASE
  WHEN is_active THEN 'active'
  ELSE 'disabled'
END;

ALTER TABLE users
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN password_hash DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS users_password_hash_nonempty_chk,
  DROP COLUMN is_active,
  DROP COLUMN password_must_change,
  DROP COLUMN temporary_password_expires_at,
  ADD CONSTRAINT users_status_chk
    CHECK (status IN ('pending_activation', 'active', 'disabled')),
  ADD CONSTRAINT users_password_hash_nonempty_chk
    CHECK (password_hash IS NULL OR length(btrim(password_hash)) > 0);

CREATE TABLE user_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT user_activation_tokens_token_hash_nonempty_chk
    CHECK (length(btrim(token_hash)) > 0)
);

CREATE INDEX user_activation_tokens_user_id_idx
  ON user_activation_tokens (user_id);

CREATE INDEX user_activation_tokens_organization_id_idx
  ON user_activation_tokens (organization_id);

CREATE INDEX user_activation_tokens_created_by_user_id_idx
  ON user_activation_tokens (created_by_user_id);

CREATE INDEX user_activation_tokens_expires_at_idx
  ON user_activation_tokens (expires_at);

CREATE UNIQUE INDEX user_activation_tokens_one_active_per_user
  ON user_activation_tokens (user_id)
  WHERE used_at IS NULL
    AND revoked_at IS NULL;

-- migrate:down

DROP INDEX IF EXISTS user_activation_tokens_one_active_per_user;
DROP INDEX IF EXISTS user_activation_tokens_expires_at_idx;
DROP INDEX IF EXISTS user_activation_tokens_created_by_user_id_idx;
DROP INDEX IF EXISTS user_activation_tokens_organization_id_idx;
DROP INDEX IF EXISTS user_activation_tokens_user_id_idx;
DROP TABLE IF EXISTS user_activation_tokens;

ALTER TABLE users
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN password_must_change boolean NOT NULL DEFAULT false,
  ADD COLUMN temporary_password_expires_at timestamptz;

UPDATE users
SET is_active = CASE
  WHEN status = 'active' THEN true
  ELSE false
END;

-- password_must_change and temporary_password_expires_at are intentionally restored with
-- safe defaults because their previous per-user values cannot be recovered after migrate:up.
ALTER TABLE users
  ALTER COLUMN password_hash SET NOT NULL,
  DROP CONSTRAINT IF EXISTS users_password_hash_nonempty_chk,
  DROP CONSTRAINT IF EXISTS users_status_chk,
  DROP COLUMN status,
  ADD CONSTRAINT users_password_hash_nonempty_chk
    CHECK (length(btrim(password_hash)) > 0);
