-- migrate:up

ALTER TABLE users
  ADD COLUMN failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz;

-- migrate:down

ALTER TABLE users
  DROP COLUMN locked_until,
  DROP COLUMN failed_login_attempts;
