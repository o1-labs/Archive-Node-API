#!/usr/bin/env bash
set -eo pipefail  

# default to 'mainnet'
NETWORK="${1:-mainnet}"

# Validate the network input
if [[ "$NETWORK" != "mainnet" && "$NETWORK" != "devnet" ]]; then
  echo "Usage: $0 [mainnet|devnet]"
  exit 1
fi

# Define output paths and base URL
DATA_DIR="data"
DB_DIR="db"
PG_DUMP="archive.sql"
BASE_URL="https://storage.googleapis.com/mina-archive-dumps"

# Stop docker containers 
docker-compose stop postgres

# clear db and data directories
rm -rf "$DB_DIR"
rm -rf "$DATA_DIR"
mkdir -p "$DB_DIR"
mkdir -p "$DATA_DIR"
mkdir -p "$DATA_DIR"
cd "$DATA_DIR"


# get date as YYYY-MM-DD
get_date() {
  local offset=${1:-0}
  # macOS
  if [[ "$OSTYPE" == "darwin"* ]]; then
    date -u -v -"$offset"d '+%Y-%m-%d'
  # linux
  else
    date -u -d "-$offset days" '+%Y-%m-%d'
  fi
}

# get most recent GMT hour as HHMM
get_hour() {
  local offset=${1:-0}
  # macOS
  if [[ "$OSTYPE" == "darwin"* ]]; then
    date -u -v -"$offset"H '+%H00'
  # linux
  else
    date -u -d "-$offset hours" '+%H00'
  fi
}


# Look for the most recent archive node DB dump from the last 3 hours
for i in $(seq 0 2); do
  DATE=$(get_date)
  HOUR=$(get_hour "$i")
  FILE="${NETWORK}-archive-dump-${DATE}_${HOUR}.sql.tar.gz"
  URL="${BASE_URL}/${FILE}"

  echo "Attempting to download archive node DB dump from: $URL"

  # abort download if the file is an XML error page
  if curl -sf -O "$URL" && ! grep -q "<Error>" "$FILE"; then
    tar -xf "$FILE"
    mv "${FILE%.tar.gz}" "$PG_DUMP"
    rm "$FILE"
    echo "Downloaded and extracted to $DATA_DIR/$PG_DUMP"
    exit 0
  fi
done

# If not found, try the last 3 days at 00:00
for i in $(seq 0 2); do
  DATE=$(get_date "$i")
  FILE="${NETWORK}-archive-dump-${DATE}_0000.sql.tar.gz"
  URL="${BASE_URL}/${FILE}"

  echo "Attempting to download archive node DB dump from: $URL"

  # abort download if the file is an XML error page
  if curl -sf -O "$URL" && ! grep -q "<Error>" "$FILE"; then
    tar -xf "$FILE"
    mv "${FILE%.tar.gz}" "$PG_DUMP"
    rm "$FILE"
    echo "Downloaded and extracted to $DATA_DIR/$PG_DUMP"
    exit 0
  fi
done

echo "No valid dump found for network=$NETWORK in the last 10 days"
exit 1
