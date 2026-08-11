-- migrate:up

ALTER TABLE organization_invites
  ADD COLUMN created_by_membership_id uuid,
  ADD COLUMN redeemed_at timestamptz,
  ADD COLUMN redeemed_membership_id uuid,
  ADD CONSTRAINT organization_invites_creator_org_fkey
    FOREIGN KEY (created_by_membership_id, organization_id)
    REFERENCES organization_memberships(id, organization_id)
    ON DELETE RESTRICT
    NOT VALID,
  ADD CONSTRAINT organization_invites_redeemed_membership_org_fkey
    FOREIGN KEY (redeemed_membership_id, organization_id)
    REFERENCES organization_memberships(id, organization_id)
    ON DELETE RESTRICT
    NOT VALID,
  ADD CONSTRAINT organization_invites_redemption_state_chk
    CHECK (
      (redeemed_at IS NULL AND redeemed_membership_id IS NULL)
      OR (redeemed_at IS NOT NULL AND redeemed_membership_id IS NOT NULL)
    ) NOT VALID,
  ADD CONSTRAINT organization_invites_revoked_redeemed_chk
    CHECK (revoked_at IS NULL OR redeemed_at IS NULL) NOT VALID;

ALTER TABLE organization_invites
  DROP CONSTRAINT organization_invites_role_chk,
  ADD CONSTRAINT organization_invites_role_chk
    CHECK (role IN ('member', 'manager')) NOT VALID;

-- migrate:down

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM organization_invites
    WHERE role <> 'member'
  ) THEN
    RAISE EXCEPTION
      'cannot rollback organization invite role expansion while non-member invites exist';
  END IF;
END
$$;

ALTER TABLE organization_invites
  DROP CONSTRAINT organization_invites_role_chk,
  ADD CONSTRAINT organization_invites_role_chk
    CHECK (role = 'member');

ALTER TABLE organization_invites
  DROP CONSTRAINT IF EXISTS organization_invites_revoked_redeemed_chk,
  DROP CONSTRAINT IF EXISTS organization_invites_redemption_state_chk,
  DROP CONSTRAINT IF EXISTS organization_invites_redeemed_membership_org_fkey,
  DROP CONSTRAINT IF EXISTS organization_invites_creator_org_fkey,
  DROP COLUMN IF EXISTS redeemed_membership_id,
  DROP COLUMN IF EXISTS redeemed_at,
  DROP COLUMN IF EXISTS created_by_membership_id;
