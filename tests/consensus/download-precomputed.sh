#!/bin/bash
set -e
set -o pipefail

# Google Cloud Storage bucket where the zip files are uploaded
bucket="gs://mina-consensus-precomputed-blocks-json/"

# Get the latest file name from the bucket
latest_file=$(gsutil ls -l $bucket | sort -k2 | awk 'NF{print $NF}' | tail -1)

if [ -z "$latest_file" ]; then
  echo "No files found in the bucket."
  exit 1
fi

# Set the download location to the first argument or default to the current directory
download_location="${1:-.}"

# Get the base name of the latest file to use when downloading
base_name=$(basename "$latest_file")

# Download the latest file to the provided location
gsutil cp "$latest_file" "$download_location/$base_name"

echo "Downloaded: $latest_file to $download_location"

# Unzip the file in the provided location
unzip "$download_location/$base_name" -d "$download_location"

# Remove the zip file
rm "$download_location/$base_name"

echo "Unzipped and removed: $download_location/$base_name"
