#!/bin/bash
set -e
set -o pipefail

# Constants
BUCKET="gs://mina_network_block_data/"
UPLOAD_BUCKET="gs://mina-consensus-precomputed-blocks-json/"
PREFIX="berkeley-"
DIR="precomputed_blocks"
START_DATE=$(date -d "2023-08-13" "+%s")000

# Initialize
mkdir -p "$DIR"

# Download files from bucket with given prefix and range
download_files() {
  for i in $(seq 2 250); do
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
  local current_date
  current_date=$(date "+%Y-%m-%d")
  local zip_name="precomputed_blocks_$current_date.zip"

  zip -r $zip_name $DIR/
  gsutil cp $zip_name $UPLOAD_BUCKET
}

# Main execution
download_files
process_files
archive_and_upload
