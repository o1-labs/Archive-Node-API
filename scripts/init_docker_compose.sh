#!/bin/bash

# This script is used to initialize the docker-compose Archive Node.
# It will create a user and database in Postgres, and import the SQL dump file.

set -e
psql -U "${PGUSER}" "${PGDATABASE}" -c "CREATE USER zkapps_monitor;"
psql -U "${PGUSER}" "${PGDATABASE}" < /data/"${PG_DUMP}"
