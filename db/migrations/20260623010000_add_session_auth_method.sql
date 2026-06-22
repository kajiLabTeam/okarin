-- migrate:up

ALTER TABLE sessions
  ADD COLUMN auth_method text NOT NULL DEFAULT 'password',
  ADD CONSTRAINT sessions_auth_method_chk
    CHECK (auth_method IN ('password', 'oidc'));

-- migrate:down

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_auth_method_chk,
  DROP COLUMN IF EXISTS auth_method;
