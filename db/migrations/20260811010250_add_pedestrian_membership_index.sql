-- migrate:up transaction:false

CREATE UNIQUE INDEX CONCURRENTLY pedestrians_membership_id_key
  ON pedestrians (membership_id)
  WHERE membership_id IS NOT NULL;

-- migrate:down transaction:false

DROP INDEX CONCURRENTLY IF EXISTS pedestrians_membership_id_key;
