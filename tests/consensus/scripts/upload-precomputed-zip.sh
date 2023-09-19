#!/bin/bash

# This script automates the process of downloading block data with a given prefix from a specified Google Cloud Storage bucket.
# It then processes the downloaded files, checking for a certain time threshold and removing files that don't meet the criteria.
# Afterwards, the script archives the remaining files into a zip and uploads them to another GCS bucket.
# Usage:
#   ./tests/consensus/scripts/upload-precomputed-zip.sh [directory_for_precomputed_blocks]
#   Example: ./tests/consensus/scripts/upload-precomputed-zip.sh ./tests/consensus/precomputed_blocks

set -e
set -o pipefail

BUCKET="gs://mina_network_block_data/"
UPLOAD_BUCKET="gs://mina-consensus-precomputed-blocks-json/"
PREFIX="berkeley-"
START_DATE=$(date -d "2023-08-13" "+%s")000 # Date the current Berkeley network was deployed

# Use provided directory or default to the original location
DIR="${1:-$(dirname "$0")/../precomputed_blocks}"

# Initialize
mkdir -p "$DIR"

# Download files from bucket with given prefix and range
download_files() {
  for i in $(seq 2 5); do
    gsutil -m cp "${BUCKET}${PREFIX}${i}-*" "$DIR/"
  done
}

# Process downloaded files
process_files() {
  for file in $(ls "$DIR"); do
    local file_path="$DIR/$file"
    echo "Processing file $file_path"
    
    local scheduled_time
    scheduled_time=$(jq -r '.data.scheduled_time' "$file_path")

    # Remove the file if scheduled_time is not later than START_DATE
    [[ "$scheduled_time" -le "$START_DATE" ]] && rm "$file_path"
  done
}

# Archive and upload
archive_and_upload() {
  echo "Archiving and uploading files in $DIR"
  local current_date
  current_date=$(date "+%Y-%m-%d")
  local zip_name="precomputed_blocks_$current_date.zip"
  local parent_dir="$(dirname "$DIR")"

  # Change directory to the parent of $DIR
  pushd "$parent_dir"
  echo "Archiving $(basename "$DIR") to $zip_name"
  zip -r $zip_name "$(basename "$DIR")/"
  popd
  
  echo "Uploading $parent_dir/$zip_name to $UPLOAD_BUCKET"
  gsutil cp "$parent_dir/$zip_name" $UPLOAD_BUCKET
}


download_files
process_files
archive_and_upload