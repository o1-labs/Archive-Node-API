#!/usr/bin/env bash

# This script generates a Mina keypair and a libp2p keypair.
# This is used to bootstrap the Mina daemon in the docker container that's used by the docker compose network.
# It will generate a keypair under /HOME/keys and name the keys "libp2p-keys".
# These should not be used in production, and are only used for local development.

# To run this script, make sure you have the following installed:
# - Docker: https://docs.docker.com/engine/install
# - Mina Daemon: https://docs.minaprotocol.com/node-operators/getting-started

# Usage: ./generate_libp2p.sh [docker|binary]
# - docker: Generate keypair using Docker only
# - binary: Generate libp2p keypair using mina binary only

# Enable debug mode
set -x

# Exit on error, and pipefail
set -eo pipefail
. ../.env

# Get mode from first argument
MODE="${1}"

# Validate mode
if [[ "$MODE" != "docker" && "$MODE" != "binary" ]]; then
  echo "Usage: $0 [docker|binary]"
  echo "  docker - Generate keypair using Docker only"
  echo "  binary - Generate libp2p keypair using mina binary only"
  exit 1
fi

# Set environment variable
# Make sure these match the environment variables used in the docker-compose.yml file
export MINA_LIBP2P_PASS=$MINA_LIBP2P_PASS

# Constants
KEYPAIR_DIR="keys"
KEYPAIR_NAME="libp2p-keys"
MINA_KEYPAIR_IMAGE=$MINA

# Derived Paths
HOME_KEYPAIR_DIR="$HOME/$KEYPAIR_DIR"
KEYPAIR_PATH="$KEYPAIR_DIR/$KEYPAIR_NAME"

# Create keypair directory if not exists
if [ ! -d $HOME_KEYPAIR_DIR ]; then
    echo "Directory $HOME_KEYPAIR_DIR does not exist. Creating now..."
    mkdir -p "$HOME_KEYPAIR_DIR" 
    chmod 700 "$HOME_KEYPAIR_DIR"
    echo "Directory $HOME_KEYPAIR_DIR created and permissions set to 700."
fi

# Generate Mina keypair using Docker
if [[ "$MODE" == "docker" ]]; then
    echo "Generating Mina keypair using Docker..."
    docker run --interactive --tty --rm \
        --env "MINA_LIBP2P_PASS=$MINA_LIBP2P_PASS" \
        --volume $HOME_KEYPAIR_DIR:/keys $MINA_KEYPAIR_IMAGE \
        --privkey-path $KEYPAIR_PATH

    # Set permissions
    echo "Setting permissions for "$HOME_KEYPAIR_DIR/$KEYPAIR_NAME"..."
    sudo chown $USER:$USER "$HOME_KEYPAIR_DIR/$KEYPAIR_NAME"
    chmod 600 "$HOME_KEYPAIR_DIR/$KEYPAIR_NAME"
fi

# Generate libp2p keypair
if [[ "$MODE" == "binary" ]]; then
    echo "Generating libp2p keypair..."
    mina advanced generate-libp2p-keypair --privkey-path "$HOME_KEYPAIR_DIR/$KEYPAIR_NAME"
fi

echo "Done."
