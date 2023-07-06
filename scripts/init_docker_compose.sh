#!/bin/bash

set -e

psql -U "${PGUSER}" "${PGDATABASE}" -c "CREATE USER zkapps_monitor;"
psql -U "${PGUSER}" "${PGDATABASE}" < /data/"${PG_DUMP}"
