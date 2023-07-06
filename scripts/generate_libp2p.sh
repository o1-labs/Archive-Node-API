#!/usr/bin/env bash

# This script generates a Mina keypair and a libp2p keypair.
# This is used to bootstrap the Mina daemon in the docker container that's used by the docker compose network.
# It will generate a keypair under /HOME/keys and name the keys "libp2p-keys".
# These should not be used in production, and are only used for local development.

# Enable debug mode
set -x

# Exit on error, and pipefail
set -eo pipefail

# Set environment variable
export MINA_PRIVKEY_PASS="passlib"
export MINA_LIBP2P_PASS="passlib"

# Constants
KEYPAIR_DIR="keys"
KEYPAIR_NAME="libp2p-keys"
MINA_KEYPAIR_IMAGE="minaprotocol/mina-generate-keypair:1.3.0-9b0369c"

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
echo "Generating Mina keypair using Docker..."
docker run --interactive --tty --rm \
		--env "MINA_PRIVKEY_PASS=$MINA_PRIVKEY_PASS" \
    --volume $HOME_KEYPAIR_DIR:/keys $MINA_KEYPAIR_IMAGE \
    --privkey-path $KEYPAIR_PATH

# Set permissions
echo "Setting permissions for "$HOME_KEYPAIR_DIR/$KEYPAIR_NAME"..."
sudo chown $USER:$USER "$HOME_KEYPAIR_DIR/$KEYPAIR_NAME"
chmod 600 "$HOME_KEYPAIR_DIR/$KEYPAIR_NAME"

# Generate libp2p keypair
echo "Generating libp2p keypair..."
mina advanced generate-libp2p-keypair --privkey-path "$HOME_KEYPAIR_DIR/$KEYPAIR_NAME"

echo "Done."
