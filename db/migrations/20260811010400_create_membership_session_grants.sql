-- migrate:up

CREATE TABLE session_membership_authentications (
  session_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  user_id uuid NOT NULL,
  auth_method text NOT NULL,
  policy_version bigint NOT NULL,
  local_credential_id uuid,
  member_oidc_identity_id uuid,
  authenticated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, membership_id),
  CONSTRAINT session_membership_auth_session_user_fkey
    FOREIGN KEY (session_id, user_id)
    REFERENCES sessions(id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT session_membership_auth_membership_user_fkey
    FOREIGN KEY (membership_id, user_id)
    REFERENCES organization_memberships(id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT session_membership_auth_local_source_fkey
    FOREIGN KEY (local_credential_id, membership_id)
    REFERENCES organization_local_credentials(id, membership_id)
    ON DELETE RESTRICT,
  CONSTRAINT session_membership_auth_oidc_source_fkey
    FOREIGN KEY (member_oidc_identity_id, membership_id)
    REFERENCES organization_member_oidc_identities(id, membership_id)
    ON DELETE RESTRICT,
  CONSTRAINT session_membership_auth_policy_version_chk
    CHECK (policy_version >= 1),
  CONSTRAINT session_membership_auth_expiry_chk
    CHECK (expires_at > authenticated_at),
  CONSTRAINT session_membership_auth_source_chk
    CHECK (
      (
        auth_method = 'local'
        AND local_credential_id IS NOT NULL
        AND member_oidc_identity_id IS NULL
      )
      OR
      (
        auth_method = 'oidc'
        AND local_credential_id IS NULL
        AND member_oidc_identity_id IS NOT NULL
      )
    )
);

CREATE INDEX session_membership_auth_active_membership_idx
  ON session_membership_authentications (membership_id)
  WHERE revoked_at IS NULL;

CREATE INDEX session_membership_auth_active_local_credential_idx
  ON session_membership_authentications (local_credential_id)
  WHERE revoked_at IS NULL;

CREATE INDEX session_membership_auth_active_oidc_identity_idx
  ON session_membership_authentications (member_oidc_identity_id)
  WHERE revoked_at IS NULL;

CREATE TABLE oidc_login_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash text NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  organization_oidc_provider_id uuid NOT NULL,
  session_id uuid REFERENCES sessions(id) ON DELETE RESTRICT,
  invite_id uuid REFERENCES organization_invites(id) ON DELETE RESTRICT,
  intent text NOT NULL,
  nonce text NOT NULL,
  pkce_code_verifier_ciphertext text NOT NULL,
  return_to text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT oidc_login_transactions_provider_org_fkey
    FOREIGN KEY (organization_oidc_provider_id, organization_id)
    REFERENCES organization_oidc_providers(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT oidc_login_transactions_state_hash_nonempty_chk
    CHECK (length(btrim(state_hash)) > 0),
  CONSTRAINT oidc_login_transactions_nonce_nonempty_chk
    CHECK (length(btrim(nonce)) > 0),
  CONSTRAINT oidc_login_transactions_pkce_nonempty_chk
    CHECK (length(btrim(pkce_code_verifier_ciphertext)) > 0),
  CONSTRAINT oidc_login_transactions_return_to_chk
    CHECK (
      left(return_to, 1) = '/'
      AND left(return_to, 2) <> '//'
      AND position(E'\\' IN return_to) = 0
    ),
  CONSTRAINT oidc_login_transactions_intent_chk
    CHECK (intent IN ('login', 'reauthenticate', 'accept_invite', 'link_identity')),
  CONSTRAINT oidc_login_transactions_intent_state_chk
    CHECK (
      (intent = 'login' AND session_id IS NULL AND invite_id IS NULL)
      OR (intent = 'reauthenticate' AND session_id IS NOT NULL AND invite_id IS NULL)
      OR (intent = 'accept_invite' AND invite_id IS NOT NULL)
      OR (intent = 'link_identity' AND session_id IS NOT NULL AND invite_id IS NULL)
    )
);

CREATE INDEX oidc_login_transactions_expires_at_idx
  ON oidc_login_transactions (expires_at);

CREATE TABLE authentication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT NOW(),
  event_type text NOT NULL,
  outcome text NOT NULL,
  failure_code text,
  user_id uuid,
  organization_id uuid,
  membership_id uuid,
  session_id uuid,
  auth_method text,
  credential_reference_id uuid,
  request_id text,
  ip_address_hash text,
  user_agent text,
  CONSTRAINT authentication_events_event_type_nonempty_chk
    CHECK (length(btrim(event_type)) > 0),
  CONSTRAINT authentication_events_outcome_chk
    CHECK (outcome IN ('success', 'failure')),
  CONSTRAINT authentication_events_auth_method_chk
    CHECK (auth_method IS NULL OR auth_method IN ('local', 'oidc'))
);

CREATE INDEX authentication_events_org_occurred_at_idx
  ON authentication_events (organization_id, occurred_at DESC);

CREATE INDEX authentication_events_user_occurred_at_idx
  ON authentication_events (user_id, occurred_at DESC);

CREATE INDEX authentication_events_occurred_at_idx
  ON authentication_events (occurred_at);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT NOW(),
  actor_user_id uuid,
  actor_membership_id uuid,
  organization_id uuid,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  action text NOT NULL,
  changed_fields text[] NOT NULL,
  before_values jsonb,
  after_values jsonb,
  request_id text,
  CONSTRAINT audit_events_target_type_nonempty_chk
    CHECK (length(btrim(target_type)) > 0),
  CONSTRAINT audit_events_action_nonempty_chk
    CHECK (length(btrim(action)) > 0)
);

CREATE INDEX audit_events_org_occurred_at_idx
  ON audit_events (organization_id, occurred_at DESC);

CREATE INDEX audit_events_target_occurred_at_idx
  ON audit_events (target_type, target_id, occurred_at DESC);

CREATE INDEX audit_events_occurred_at_idx
  ON audit_events (occurred_at);

CREATE TRIGGER set_updated_at_session_membership_authentications
BEFORE UPDATE ON session_membership_authentications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- migrate:down

DROP TRIGGER IF EXISTS set_updated_at_session_membership_authentications
  ON session_membership_authentications;

DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS authentication_events;
DROP TABLE IF EXISTS oidc_login_transactions;
DROP TABLE IF EXISTS session_membership_authentications;
