# This script is used to download a nightly Berkeley database dump used for debugging purposes.
#!/usr/bin/env bash
set -x
set -eo pipefail

PG_DUMP="berkeley-archive.sql"
DATA_DIR="data"
CURRENT_DATE=$(date '+%Y-%m-%d')

# Create the data directory if it doesn't exist
mkdir -p ${DATA_DIR}

# Change to the data directory
cd ${DATA_DIR}

# Download the archive file
curl -LJO https://storage.googleapis.com/mina-archive-dumps/berkeley-archive-dump-${CURRENT_DATE}_0000.sql.tar.gz

# Extract the database dump
tar -xf berkeley-archive-dump-${CURRENT_DATE}_0000.sql.tar.gz

# Rename the extracted database dump
mv berkeley-archive-dump-${CURRENT_DATE}_0000.sql berkeley-archive.sql

# Remove the original archive file
rm berkeley-archive-dump-${CURRENT_DATE}_0000.sql.tar.gz