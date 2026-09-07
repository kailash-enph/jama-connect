#!/bin/sh
# Jama Cache Server container entrypoint
#
# Seeds server_config.json into the data volume on first run so the admin
# password and project list survive container rebuilds without a full reset.

set -e

DATA=/data

# Ensure data/projects directory exists (volume may be empty on first run)
mkdir -p "${DATA}/projects"

# Seed server_config.json from the baked-in default if not already present
if [ ! -f "${DATA}/server_config.json" ] && [ -f /app/server_config.json ]; then
    echo "[entrypoint] First run — copying server_config.json to ${DATA}/"
    cp /app/server_config.json "${DATA}/server_config.json"
fi

exec python cache_server.py \
    --port 8867 \
    --host 0.0.0.0 \
    --data "${DATA}" \
    --config "${DATA}/server_config.json" \
    "$@"
