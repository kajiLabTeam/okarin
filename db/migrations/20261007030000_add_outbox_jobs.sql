-- migrate:up
CREATE TABLE outbox_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  leased_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_jobs_status_chk CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT outbox_jobs_attempts_chk CHECK (attempts >= 0),
  CONSTRAINT outbox_jobs_max_attempts_chk CHECK (max_attempts > 0),
  CONSTRAINT outbox_jobs_payload_chk CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX outbox_jobs_pending_claim_idx ON outbox_jobs (status, run_at) WHERE status IN ('pending', 'processing');
CREATE INDEX outbox_jobs_lease_idx ON outbox_jobs (lease_token, leased_until) WHERE lease_token IS NOT NULL;

-- migrate:down
DROP TABLE outbox_jobs;
