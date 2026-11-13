#!/bin/sh
set -eu
umask 027
# Refuse an ephemeral /data directory even when the ML worker is disabled.
python -c 'import os; assert os.path.ismount("/data"), "Mount the persistent volume at /data before starting"'
mkdir -p /data/ml
if [ "$(id -u)" = 0 ]; then
    chown -R 10001:10001 /data/ml
    chmod 750 /data/ml
    exec gosu investing "$@"
fi
exec "$@"
