#!/bin/bash

# This script facilitates the process of setting up and testing the Mina consensus protocol.
# It handles the following tasks:
#   1. Checks prerequisites like npm and necessary directories.
#   2. Clones or updates the Mina repository from GitHub.
#   3. Builds the OCaml app and runs it.
#   4. Runs the TypeScript app and a comparison script.

# Usage:
#   Simply execute this script. No arguments required.
#   ./tests/consensus/scripts/run-consensus-apps.sh

set -eo pipefail

REPO_URL="git@github.com:MinaProtocol/mina.git"
BRANCH="feat/berkeley-pos-test-client" # TODO replace this with "berkeley"
DIR="./tests/consensus/mina"
APP_PATH="./src/app/consensus_test"
EXE_PATH="./_build/default/src/app/consensus_test/consensus_test.exe"
PRECOMPUTED_DIR="../precomputed_blocks"
OUTPUT_DIR="../precomputed_ocaml"
CONFIG_FILE="./genesis_ledgers/berkeley.json"

if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install npm first as npx is required."
    exit 1
fi

# Check if node_modules directory exists
if [ ! -d "node_modules" ]; then
    echo "node_modules directory not found. Running npm install..."
    npm install
fi

# Check if $PRECOMPUTED_DIR exists
if [ ! -d "$PRECOMPUTED_DIR" ]; then
    echo "$PRECOMPUTED_DIR does not exist. Downloading precomputed data..."
    ./tests/consensus/scripts/download-precomputed.sh ./tests/consensus/
fi

# Clone the repository if it doesn't exist, otherwise pull
if [ ! -d "$DIR" ]; then
    git clone -b $BRANCH $REPO_URL $DIR
else
    pushd $DIR
    echo "Pulling $BRANCH from $REPO_URL"
    git pull origin $BRANCH
    popd
fi

# Navigate to the repository directory
pushd $DIR

# Update submodules
echo "Updating submodules"
git submodule update --init --recursive

# Build the app
echo "Building OCaml app"
time dune b $APP_PATH

# Run the app
echo "Running OCaml app"
echo "precomputed-dir: $PRECOMPUTED_DIR"
$EXE_PATH --precomputed-dir $PRECOMPUTED_DIR --output-dir $OUTPUT_DIR --config-file $CONFIG_FILE

# Return to the original directory
popd

# Run the TypeScript app and the compare script
echo "Running TypeScript app"
npx ts-node tests/consensus/select-consensus-precomputed.ts ./tests/consensus/precomputed_blocks ./tests/consensus/precomputed_ts

echo "Running compare script"
npx ts-node tests/consensus/run-compare.ts ./tests/consensus/precomputed_ts ./tests/consensus/precomputed_ocaml