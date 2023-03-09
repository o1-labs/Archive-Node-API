#!/bin/bash

set -e

psql -U "${DB_USER}" "${DB_NAME}" -c "CREATE USER zkapps_monitor;"
psql -U "${DB_USER}" "${DB_NAME}" < /data/"${PG_DUMP}"
