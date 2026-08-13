ALTER TABLE oidc_login_transactions
  ADD COLUMN expected_user_id uuid,
  ADD COLUMN mobile_redirect_uri text,
  ADD COLUMN mobile_code_challenge text,
  ADD COLUMN mobile_code_challenge_method text;

ALTER TABLE oidc_login_transactions
  ADD CONSTRAINT oidc_login_transactions_mobile_fields_chk CHECK (
    (mobile_redirect_uri IS NULL AND mobile_code_challenge IS NULL AND mobile_code_challenge_method IS NULL)
    OR (
      mobile_redirect_uri IS NOT NULL
      AND mobile_code_challenge IS NOT NULL
      AND mobile_code_challenge_method = 'S256'
    )
  );

CREATE TABLE mobile_session_exchange_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code_hash text NOT NULL,
  oidc_transaction_id uuid NOT NULL,
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  intent text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT mobile_session_exchange_codes_hash_nonempty_chk CHECK (length(btrim(code_hash)) > 0),
  CONSTRAINT mobile_session_exchange_codes_intent_chk CHECK (intent IN ('login', 'reauthenticate'))
);

CREATE UNIQUE INDEX mobile_session_exchange_codes_code_hash_idx
  ON mobile_session_exchange_codes (code_hash);
CREATE INDEX mobile_session_exchange_codes_expiry_idx
  ON mobile_session_exchange_codes (expires_at)
  WHERE consumed_at IS NULL;
