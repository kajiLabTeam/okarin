-- migrate:up

CREATE TABLE organization_oidc_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  issuer text NOT NULL,
  client_id text NOT NULL,
  client_secret_ref text,
  scopes text[] NOT NULL,
  allowed_hosted_domains text[],
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_oidc_providers_name_nonempty_chk
    CHECK (length(btrim(name)) > 0),
  CONSTRAINT organization_oidc_providers_issuer_nonempty_chk
    CHECK (length(btrim(issuer)) > 0),
  CONSTRAINT organization_oidc_providers_client_id_nonempty_chk
    CHECK (length(btrim(client_id)) > 0),
  CONSTRAINT organization_oidc_providers_openid_scope_chk
    CHECK (COALESCE('openid' = ANY(scopes), false)),
  CONSTRAINT organization_oidc_providers_hosted_domains_nonempty_chk
    CHECK (
      allowed_hosted_domains IS NULL
      OR cardinality(allowed_hosted_domains) > 0
    ),
  CONSTRAINT organization_oidc_providers_org_issuer_client_key
    UNIQUE (organization_id, issuer, client_id),
  CONSTRAINT organization_oidc_providers_id_org_key
    UNIQUE (id, organization_id)
);

CREATE TABLE organization_local_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  login_email text NOT NULL,
  normalized_login_email text NOT NULL,
  password_hash text NOT NULL,
  password_changed_at timestamptz NOT NULL DEFAULT NOW(),
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_local_credentials_membership_key
    UNIQUE (membership_id),
  CONSTRAINT organization_local_credentials_id_membership_key
    UNIQUE (id, membership_id),
  CONSTRAINT organization_local_credentials_membership_org_fkey
    FOREIGN KEY (membership_id, organization_id)
    REFERENCES organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT organization_local_credentials_login_email_nonempty_chk
    CHECK (length(btrim(login_email)) > 0),
  CONSTRAINT organization_local_credentials_normalized_email_nonempty_chk
    CHECK (length(btrim(normalized_login_email)) > 0),
  CONSTRAINT organization_local_credentials_password_hash_nonempty_chk
    CHECK (length(btrim(password_hash)) > 0),
  CONSTRAINT organization_local_credentials_failed_attempts_chk
    CHECK (failed_login_attempts >= 0)
);

CREATE UNIQUE INDEX organization_local_credentials_active_email_key
  ON organization_local_credentials (
    organization_id,
    normalized_login_email
  )
  WHERE enabled;

CREATE TABLE oidc_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  issuer text NOT NULL,
  subject text NOT NULL,
  last_claimed_email text,
  last_claimed_email_verified boolean,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT oidc_identities_issuer_nonempty_chk
    CHECK (length(btrim(issuer)) > 0),
  CONSTRAINT oidc_identities_subject_nonempty_chk
    CHECK (length(btrim(subject)) > 0),
  CONSTRAINT oidc_identities_issuer_subject_key
    UNIQUE (issuer, subject),
  CONSTRAINT oidc_identities_id_user_key
    UNIQUE (id, user_id)
);

CREATE TABLE organization_member_oidc_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  organization_oidc_provider_id uuid NOT NULL,
  oidc_identity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  revoked_at timestamptz,
  CONSTRAINT organization_member_oidc_membership_user_fkey
    FOREIGN KEY (membership_id, user_id)
    REFERENCES organization_memberships(id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT organization_member_oidc_identity_user_fkey
    FOREIGN KEY (oidc_identity_id, user_id)
    REFERENCES oidc_identities(id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT organization_member_oidc_membership_org_fkey
    FOREIGN KEY (membership_id, organization_id)
    REFERENCES organization_memberships(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT organization_member_oidc_provider_org_fkey
    FOREIGN KEY (organization_oidc_provider_id, organization_id)
    REFERENCES organization_oidc_providers(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT organization_member_oidc_id_membership_key
    UNIQUE (id, membership_id),
  CONSTRAINT organization_member_oidc_link_key
    UNIQUE (
      membership_id,
      organization_oidc_provider_id,
      oidc_identity_id
    )
);

CREATE UNIQUE INDEX organization_member_oidc_active_provider_identity_key
  ON organization_member_oidc_identities (
    organization_oidc_provider_id,
    oidc_identity_id
  )
  WHERE revoked_at IS NULL;

CREATE INDEX organization_member_oidc_active_membership_idx
  ON organization_member_oidc_identities (membership_id)
  WHERE revoked_at IS NULL;

CREATE TRIGGER set_updated_at_organization_oidc_providers
BEFORE UPDATE ON organization_oidc_providers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_organization_local_credentials
BEFORE UPDATE ON organization_local_credentials
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_oidc_identities
BEFORE UPDATE ON oidc_identities
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_organization_member_oidc_identities
BEFORE UPDATE ON organization_member_oidc_identities
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- migrate:down

DROP TRIGGER IF EXISTS set_updated_at_organization_member_oidc_identities
  ON organization_member_oidc_identities;
DROP TRIGGER IF EXISTS set_updated_at_oidc_identities ON oidc_identities;
DROP TRIGGER IF EXISTS set_updated_at_organization_local_credentials
  ON organization_local_credentials;
DROP TRIGGER IF EXISTS set_updated_at_organization_oidc_providers
  ON organization_oidc_providers;

DROP TABLE IF EXISTS organization_member_oidc_identities;
DROP TABLE IF EXISTS oidc_identities;
DROP TABLE IF EXISTS organization_local_credentials;
DROP TABLE IF EXISTS organization_oidc_providers;
