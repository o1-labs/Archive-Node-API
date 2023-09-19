#!/bin/bash

# This script is designed to download the latest precomputed blocks from a Google Cloud Storage bucket.
# It fetches the latest file based on a naming convention, downloads it to the specified directory (or a default location),
# unzips it, and then removes the zip file.
# Usage:
#   ./tests/consensus/scripts/download-precomputed.sh [download_location]
#   Example: ./tests/consensus/scripts/download-precomputed.sh ./tests/consensus

set -e
set -o pipefail

# Google Cloud Storage bucket where the zip files are uploaded
bucket="gs://mina-consensus-precomputed-blocks-json/"

# Get the latest file name from the bucket
latest_file=$(gsutil ls $bucket | grep 'precomputed_blocks_' | sort | tail -1)

if [ -z "$latest_file" ]; then
  echo "No files found in the bucket."
  exit 1
fi

# Use provided directory or default to the parent directory of the script's location
download_location="${1:-$(dirname "$0")/..}"

# Get the base name of the latest file to use when downloading
base_name=$(basename "$latest_file")

# Download the latest file to the provided location
gsutil cp "$latest_file" "$download_location/$base_name"

echo "Downloaded: $latest_file to $download_location"

# Unzip the file in the provided location
unzip -o "$download_location/$base_name" -d "$download_location"

# Remove the zip file
rm "$download_location/$base_name"

echo "Unzipped and removed: $download_location/$base_name"
