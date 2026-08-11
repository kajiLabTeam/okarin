-- migrate:up

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM organization_memberships
    WHERE id IS NULL OR status IS NULL OR joined_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'membership UUID primary key promotion requires the multi-organization auth backfill';
  END IF;
END
$$;

ALTER TABLE organization_memberships ALTER COLUMN id SET NOT NULL;
ALTER TABLE organization_memberships ALTER COLUMN status SET NOT NULL;
ALTER TABLE organization_memberships ALTER COLUMN joined_at SET NOT NULL;

ALTER TABLE organization_memberships
  DROP CONSTRAINT organization_memberships_pkey;

ALTER TABLE organization_memberships
  ADD CONSTRAINT organization_memberships_pkey
  PRIMARY KEY USING INDEX organization_memberships_id_key;

-- migrate:down

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM organization_memberships
    GROUP BY organization_id, user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'cannot restore the legacy membership primary key after a user has rejoined an organization';
  END IF;
END
$$;

CREATE UNIQUE INDEX organization_memberships_id_key
  ON organization_memberships (id);

ALTER TABLE organization_member_profiles
  DROP CONSTRAINT organization_member_profiles_membership_id_fkey;

ALTER TABLE organization_memberships
  DROP CONSTRAINT organization_memberships_pkey;

ALTER TABLE organization_memberships
  ADD CONSTRAINT organization_memberships_pkey
  PRIMARY KEY (organization_id, user_id);

ALTER TABLE organization_member_profiles
  ADD CONSTRAINT organization_member_profiles_membership_id_fkey
  FOREIGN KEY (membership_id)
  REFERENCES organization_memberships(id) ON DELETE RESTRICT;

ALTER TABLE organization_memberships ALTER COLUMN id DROP NOT NULL;
ALTER TABLE organization_memberships ALTER COLUMN status DROP NOT NULL;
ALTER TABLE organization_memberships ALTER COLUMN joined_at DROP NOT NULL;
