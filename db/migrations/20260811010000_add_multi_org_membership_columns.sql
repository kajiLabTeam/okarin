-- migrate:up

ALTER TABLE users
  ADD COLUMN contact_email text,
  ADD COLUMN normalized_contact_email text,
  ADD COLUMN contact_email_verified_at timestamptz,
  ADD CONSTRAINT users_contact_email_state_chk
    CHECK (
      contact_email IS NOT NULL
      OR (
        normalized_contact_email IS NULL
        AND contact_email_verified_at IS NULL
      )
    ) NOT VALID;

ALTER TABLE organizations
  ADD COLUMN status text,
  ADD CONSTRAINT organizations_status_chk
    CHECK (status IN ('active', 'suspended')) NOT VALID;

ALTER TABLE organizations
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE organization_memberships
  ADD COLUMN id uuid,
  ADD COLUMN status text,
  ADD COLUMN joined_at timestamptz,
  ADD COLUMN left_at timestamptz,
  ADD CONSTRAINT organization_memberships_status_chk
    CHECK (status IN ('active', 'suspended', 'left')) NOT VALID,
  ADD CONSTRAINT organization_memberships_left_at_chk
    CHECK (
      (status = 'left' AND left_at IS NOT NULL)
      OR (status <> 'left' AND left_at IS NULL)
    ) NOT VALID;

ALTER TABLE organization_memberships
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN joined_at SET DEFAULT NOW();

-- migrate:down

ALTER TABLE organization_memberships
  DROP CONSTRAINT IF EXISTS organization_memberships_left_at_chk,
  DROP CONSTRAINT IF EXISTS organization_memberships_status_chk,
  DROP COLUMN IF EXISTS left_at,
  DROP COLUMN IF EXISTS joined_at,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS id;

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_status_chk,
  DROP COLUMN IF EXISTS status;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_contact_email_state_chk,
  DROP COLUMN IF EXISTS contact_email_verified_at,
  DROP COLUMN IF EXISTS normalized_contact_email,
  DROP COLUMN IF EXISTS contact_email;
