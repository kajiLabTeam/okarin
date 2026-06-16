-- migrate:up

ALTER TABLE organizations
  ADD COLUMN slug text;

UPDATE organizations
SET slug = 'org-' || replace(id::text, '-', '')
WHERE slug IS NULL;

ALTER TABLE organizations
  ALTER COLUMN slug SET NOT NULL,
  ALTER COLUMN slug SET DEFAULT ('org-' || replace(gen_random_uuid()::text, '-', '')),
  ADD CONSTRAINT organizations_slug_format_chk
    CHECK (
      slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      AND length(slug) BETWEEN 3 AND 63
    ),
  ADD CONSTRAINT organizations_slug_reserved_chk
    CHECK (slug NOT IN ('admin', 'api', 'auth', 'platform', 'new', 'settings'));

ALTER TABLE organizations
  ADD CONSTRAINT organizations_slug_key UNIQUE (slug);

CREATE TABLE auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  hosted_domain text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT auth_identities_provider_chk
    CHECK (provider IN ('google')),
  CONSTRAINT auth_identities_provider_subject_unique
    UNIQUE (provider, provider_subject)
);

CREATE UNIQUE INDEX auth_identities_one_google_identity_per_user
  ON auth_identities (provider, user_id)
  WHERE provider = 'google';

CREATE INDEX auth_identities_user_id_idx
  ON auth_identities (user_id);

CREATE TABLE organization_creation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_organization_name text NOT NULL,
  requested_slug text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  rejected_reason text,
  created_organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_creation_requests_status_chk
    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT organization_creation_requests_name_nonempty_chk
    CHECK (length(btrim(requested_organization_name)) > 0),
  CONSTRAINT organization_creation_requests_requested_slug_format_chk
    CHECK (
      requested_slug IS NULL OR (
        requested_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND length(requested_slug) BETWEEN 3 AND 63
        AND requested_slug NOT IN ('admin', 'api', 'auth', 'platform', 'new', 'settings')
      )
    ),
  CONSTRAINT organization_creation_requests_reviewed_state_chk
    CHECK (
      (status = 'pending' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
      OR (status IN ('approved', 'rejected') AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
  CONSTRAINT organization_creation_requests_approved_organization_chk
    CHECK (
      (status = 'approved' AND created_organization_id IS NOT NULL)
      OR (status <> 'approved' AND created_organization_id IS NULL)
    )
);

CREATE UNIQUE INDEX organization_creation_requests_one_pending_per_user
  ON organization_creation_requests (requester_user_id)
  WHERE status = 'pending';

CREATE INDEX organization_creation_requests_requester_user_id_idx
  ON organization_creation_requests (requester_user_id);

CREATE INDEX organization_creation_requests_status_created_at_idx
  ON organization_creation_requests (status, created_at DESC);

CREATE TABLE organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_invites_token_hash_nonempty_chk
    CHECK (length(btrim(token_hash)) > 0),
  CONSTRAINT organization_invites_email_nonempty_chk
    CHECK (length(btrim(email)) > 0),
  CONSTRAINT organization_invites_role_chk
    CHECK (role = 'member'),
  CONSTRAINT organization_invites_used_count_chk
    CHECK (used_count >= 0),
  CONSTRAINT organization_invites_max_uses_chk
    CHECK (max_uses > 0),
  CONSTRAINT organization_invites_usage_bounds_chk
    CHECK (used_count <= max_uses)
);

CREATE INDEX organization_invites_organization_id_idx
  ON organization_invites (organization_id);

CREATE INDEX organization_invites_email_idx
  ON organization_invites (email);

CREATE INDEX organization_invites_created_by_user_id_idx
  ON organization_invites (created_by_user_id);

CREATE INDEX organization_invites_expires_at_idx
  ON organization_invites (expires_at);

CREATE TABLE organization_invite_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES organization_invites(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  email text NOT NULL,
  provider_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_invite_redemptions_email_nonempty_chk
    CHECK (length(btrim(email)) > 0),
  CONSTRAINT organization_invite_redemptions_provider_subject_nonempty_chk
    CHECK (length(btrim(provider_subject)) > 0),
  CONSTRAINT organization_invite_redemptions_invite_user_unique
    UNIQUE (invite_id, user_id)
);

CREATE INDEX organization_invite_redemptions_user_id_idx
  ON organization_invite_redemptions (user_id);

CREATE TRIGGER set_updated_at_auth_identities
BEFORE UPDATE ON auth_identities
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_organization_creation_requests
BEFORE UPDATE ON organization_creation_requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_organization_invites
BEFORE UPDATE ON organization_invites
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- migrate:down

DROP TRIGGER IF EXISTS set_updated_at_organization_invites ON organization_invites;
DROP TRIGGER IF EXISTS set_updated_at_organization_creation_requests ON organization_creation_requests;
DROP TRIGGER IF EXISTS set_updated_at_auth_identities ON auth_identities;

DROP TABLE IF EXISTS organization_invite_redemptions;
DROP TABLE IF EXISTS organization_invites;
DROP TABLE IF EXISTS organization_creation_requests;

DROP INDEX IF EXISTS auth_identities_user_id_idx;
DROP INDEX IF EXISTS auth_identities_one_google_identity_per_user;
DROP TABLE IF EXISTS auth_identities;

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_slug_key,
  DROP CONSTRAINT IF EXISTS organizations_slug_reserved_chk,
  DROP CONSTRAINT IF EXISTS organizations_slug_format_chk,
  DROP COLUMN IF EXISTS slug;
