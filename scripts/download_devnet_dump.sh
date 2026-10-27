#!/usr/bin/env bash
set -eo pipefail

# Downloads the second-newest hourly archive dump of a network from GCS.
# We skip the newest dump to avoid fetching one that may still be uploading.
#
# Usage: DUMP_NETWORK=mainnet ./scripts/download_devnet_dump.sh [output_dir]
#   output_dir defaults to ./data
#   DUMP_NETWORK defaults to devnet; the bucket also holds mainnet dumps

OUTPUT_DIR="${1:-.}"
BASE_URL="https://storage.googleapis.com/mina-archive-dumps"
GCS_API="https://storage.googleapis.com/storage/v1/b/mina-archive-dumps/o"
NETWORK="${DUMP_NETWORK:-devnet}"
PG_DUMP="${NETWORK}-archive.sql"

mkdir -p "$OUTPUT_DIR"

echo "Querying GCS for available $NETWORK dumps..."

# List dumps from today and yesterday, sorted by time (GCS returns chronologically)
TODAY=$(date -u '+%Y-%m-%d')
YESTERDAY=$(date -u -d "-1 day" '+%Y-%m-%d' 2>/dev/null || date -u -v -1d '+%Y-%m-%d')

# Fetch the list of available dumps (today + yesterday for safety)
DUMPS=""
for DATE in "$TODAY" "$YESTERDAY"; do
  RESULT=$(curl -sf "${GCS_API}?prefix=${NETWORK}-archive-dump-${DATE}&fields=items(name,timeCreated)" 2>/dev/null || true)
  if [ -n "$RESULT" ]; then
    NAMES=$(echo "$RESULT" | python3 -c "import sys,json; items=json.load(sys.stdin).get('items',[]); [print(i['name']) for i in items]" 2>/dev/null || true)
    if [ -n "$NAMES" ]; then
      DUMPS="${DUMPS}${NAMES}"$'\n'
    fi
  fi
done

if [ -z "$DUMPS" ]; then
  echo "ERROR: No $NETWORK dumps found for $TODAY or $YESTERDAY"
  exit 1
fi

# Sort all dumps and pick second-to-last (skip newest to avoid incomplete)
SORTED=$(echo "$DUMPS" | grep -v '^$' | sort)
COUNT=$(echo "$SORTED" | wc -l)

if [ "$COUNT" -lt 2 ]; then
  echo "ERROR: Need at least 2 dumps to pick second-newest, found $COUNT"
  exit 1
fi

# Pick second-to-last line (the one before the newest)
TARGET=$(echo "$SORTED" | tail -n 2 | head -n 1)
echo "Selected dump (second-newest): $TARGET"

URL="${BASE_URL}/${TARGET}"

# Stream the archive into tar rather than saving it first: a mainnet dump is
# 1.6 GB compressed and several times that extracted, and a runner has little
# disk to spare. -f turns an HTTP error page into a failure, and pipefail
# carries it through the pipe.
echo "Downloading and extracting: $URL"
curl -f -# "$URL" | tar -xzf - -C "$OUTPUT_DIR"

# The extracted file is named like devnet-archive-dump-YYYY-MM-DD_HHMM.sql
EXTRACTED=$(basename "${TARGET%.tar.gz}")
mv "$OUTPUT_DIR/$EXTRACTED" "$OUTPUT_DIR/$PG_DUMP"

echo "$NETWORK dump ready at: $OUTPUT_DIR/$PG_DUMP"
