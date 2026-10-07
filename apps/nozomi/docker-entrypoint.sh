#!/bin/sh
set -eu

# Named volumes can predate this image and therefore retain root ownership.
# Restrict the privileged setup to Nozomi's state directory, then run the
# application as the unprivileged service account.
mkdir -p /var/lib/nozomi
find /var/lib/nozomi -xdev -exec chown --no-dereference appuser:appuser {} +

exec gosu appuser "$@"
