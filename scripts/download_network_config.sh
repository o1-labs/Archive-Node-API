#!/bin/bash

# Script to download config files from GitHub

# Check for required number of arguments
if [[ $# -ne 2 ]]; then
    echo "Usage: $0 <GitHub URL> <Save Path>"
    exit 1
fi

# Assigning arguments to variables for clarity
URL="$1"
SAVE_PATH="$2"

# Check if curl is installed
if ! command -v curl &> /dev/null; then
    echo "Error: curl is not installed. Please install curl to use this script."
    exit 1
fi

# Download the file
curl -L "$URL" -o "$SAVE_PATH"

# Check if the download was successful
if [[ $? -eq 0 ]]; then
    echo "File downloaded successfully to $SAVE_PATH"
else
    echo "Error: Failed to download file"
    exit 1
fi