-- migrate:up
-- Reuse short-lived single-use exchanges without inventing an organization for global login.
ALTER TABLE public.mobile_session_exchange_codes
  ALTER COLUMN oidc_transaction_id DROP NOT NULL,
  ALTER COLUMN organization_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS code_challenge text,
  DROP CONSTRAINT IF EXISTS mobile_session_exchange_codes_binding_chk,
  ADD CONSTRAINT mobile_session_exchange_codes_binding_chk CHECK (
    (oidc_transaction_id IS NOT NULL AND organization_id IS NOT NULL AND code_challenge IS NULL)
    OR (oidc_transaction_id IS NULL AND organization_id IS NULL AND intent = 'login'
        AND code_challenge IS NOT NULL AND code_challenge ~ '^[A-Za-z0-9_-]{43}$')
  );

-- migrate:down
-- Refuse rollback while global-login exchange rows exist (NOT NULL will fail).
-- Prefer a forward migration; do not silently delete authentication records.
ALTER TABLE public.mobile_session_exchange_codes
  DROP CONSTRAINT mobile_session_exchange_codes_binding_chk,
  DROP COLUMN code_challenge,
  ALTER COLUMN oidc_transaction_id SET NOT NULL,
  ALTER COLUMN organization_id SET NOT NULL;
