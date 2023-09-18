#!/bin/bash

set -eo pipefail

REPO_URL="git@github.com:MinaProtocol/mina.git"
BRANCH="feat/berkeley-pos-test-client" # TODO replace this with "berkeley"
DIR="./tests/consensus/mina"
APP_PATH="./src/app/consensus_test"
EXE_PATH="./_build/default/src/app/consensus_test/consensus_test.exe"
PRECOMPUTED_DIR="../precomputed_blocks"
OUTPUT_DIR="../precomputed_ocaml"
CONFIG_FILE="./genesis_ledgers/berkeley.json"

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
npm run compute-consensus

echo "Running compare script"
npm run run-compare
