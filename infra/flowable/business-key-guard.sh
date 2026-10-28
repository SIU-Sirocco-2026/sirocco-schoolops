#!/bin/sh
set -eu
# Only the engine DB owner installs this guard, after Flowable creates its schema.
# Keep history: it is the durable idempotency ledger for a start with a lost reply.
attempt=0
until psql -tAc "SELECT to_regclass('act_hi_procinst') IS NOT NULL" | grep -q t; do
  attempt=$((attempt+1))
  if [ "$attempt" -ge 120 ]; then echo "Flowable history schema unavailable" >&2; exit 1; fi
  sleep 2
done
psql -v ON_ERROR_STOP=1 -c 'CREATE UNIQUE INDEX IF NOT EXISTS sirocco_unique_business_key ON act_hi_procinst(business_key_) WHERE business_key_ IS NOT NULL;'
echo "Flowable business-key guard ready"
