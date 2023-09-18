#!/bin/bash
set -x
set -eo pipefail

# Google Cloud Storage bucket name
bucket="gs://mina_network_block_data/"

# Start date (last time Berkeley was redeployed) in Unix timestamp (milliseconds) 
start_date=$(date -d "2023-08-13" "+%s")000

# Prefix for file names
prefix="berkeley-"

# Directory to download the files to
dir="precomputed-blocks"

# Create the directory if it doesn't exist
mkdir -p $dir

# Download all files starting with the prefix and with a block height in the specified range
for i in $(seq 2 1000)
do
  gsutil -m cp ${bucket}${prefix}${i}-* ${dir}/
done

# Iterate over downloaded files
for file in $(ls $dir)
do
  # Full path to the file
  file_path="$dir/$file"

  echo "Processing file $file_path"

  # Extract scheduled_time from JSON
  scheduled_time=$(jq -r '.data.scheduled_time' "$file_path")

  # Check if scheduled_time is not later than start_date
  if [ "$scheduled_time" -le "$start_date" ]
  then
    # Delete the file
    rm "$file_path"
  fi
done

# Create a zip archive 
current_date=$(date "+%Y-%m-%d")
zip -r "precomputed-blocks-$current_date.zip" $dir/