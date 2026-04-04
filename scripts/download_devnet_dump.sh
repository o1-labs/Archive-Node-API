#!/usr/bin/env bash
set -eo pipefail

# Downloads the second-newest hourly devnet archive dump from GCS.
# We skip the newest dump to avoid fetching one that may still be uploading.
#
# Usage: ./scripts/download_devnet_dump.sh [output_dir]
#   output_dir defaults to ./data

OUTPUT_DIR="${1:-.}"
BASE_URL="https://storage.googleapis.com/mina-archive-dumps"
GCS_API="https://storage.googleapis.com/storage/v1/b/mina-archive-dumps/o"
NETWORK="devnet"
PG_DUMP="devnet-archive.sql"

mkdir -p "$OUTPUT_DIR"

echo "Querying GCS for available devnet dumps..."

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
  echo "ERROR: No devnet dumps found for $TODAY or $YESTERDAY"
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
ARCHIVE_FILE="${OUTPUT_DIR}/$(basename "$TARGET")"

echo "Downloading: $URL"
curl -# -o "$ARCHIVE_FILE" "$URL"

# Verify it's not an XML error page
if grep -q "<Error>" "$ARCHIVE_FILE" 2>/dev/null; then
  echo "ERROR: Downloaded file is an error page, not a valid dump"
  rm -f "$ARCHIVE_FILE"
  exit 1
fi

echo "Extracting..."
tar -xf "$ARCHIVE_FILE" -C "$OUTPUT_DIR"

# The extracted file is named like devnet-archive-dump-YYYY-MM-DD_HHMM.sql
EXTRACTED=$(basename "${TARGET%.tar.gz}")
mv "$OUTPUT_DIR/$EXTRACTED" "$OUTPUT_DIR/$PG_DUMP"
rm -f "$ARCHIVE_FILE"

echo "Devnet dump ready at: $OUTPUT_DIR/$PG_DUMP"
