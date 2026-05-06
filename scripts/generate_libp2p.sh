#!/usr/bin/env bash

# Generates a Mina account keypair and a libp2p keypair using the mina-daemon
# Docker image. Used to bootstrap the Mina daemon in the docker-compose
# network. These keys are for LOCAL DEVELOPMENT ONLY — do not use in production.
#
# Output: $HOME/keys/libp2p-keys (and the .pub file alongside).
#
# Requires: Docker (https://docs.docker.com/engine/install). No local `mina`
# binary needed — both keypair generators run inside the daemon image.

set -x
set -eo pipefail

# Match the values used in .env.example.compose / docker-compose.yml
export MINA_PRIVKEY_PASS="passlib"
export MINA_LIBP2P_PASS="passlib"

KEYPAIR_DIR="keys"
KEYPAIR_NAME="libp2p-keys"
# The mina-generate-keypair image was retired in 2022; the mina-daemon image
# absorbed its keypair-generation subcommands. Keep this tag in sync with
# .env.example.compose#MINA so we generate keys with the same toolchain we
# run the daemon under.
MINA_IMAGE="minaprotocol/mina-daemon:3.3.1-7b34378-bullseye-mainnet"

HOME_KEYPAIR_DIR="$HOME/$KEYPAIR_DIR"

if [ ! -d "$HOME_KEYPAIR_DIR" ]; then
    echo "Directory $HOME_KEYPAIR_DIR does not exist. Creating now..."
    mkdir -p "$HOME_KEYPAIR_DIR"
    chmod 700 "$HOME_KEYPAIR_DIR"
fi

# Generate the Mina account keypair
echo "Generating Mina keypair..."
docker run --interactive --tty --rm \
    --env "MINA_PRIVKEY_PASS=$MINA_PRIVKEY_PASS" \
    --volume "$HOME_KEYPAIR_DIR:/keys" \
    "$MINA_IMAGE" \
    advanced generate-keypair --privkey-path "/keys/$KEYPAIR_NAME"

# Generate the libp2p keypair (separate file: ${KEYPAIR_NAME}-libp2p)
echo "Generating libp2p keypair..."
docker run --interactive --tty --rm \
    --env "MINA_LIBP2P_PASS=$MINA_LIBP2P_PASS" \
    --volume "$HOME_KEYPAIR_DIR:/keys" \
    "$MINA_IMAGE" \
    advanced generate-libp2p-keypair --privkey-path "/keys/$KEYPAIR_NAME"

# The container runs as root, so the resulting files are root-owned. Reclaim
# them and lock down to the user.
echo "Resetting ownership and permissions on $HOME_KEYPAIR_DIR/$KEYPAIR_NAME..."
sudo chown -R "$USER:$USER" "$HOME_KEYPAIR_DIR"
chmod 600 "$HOME_KEYPAIR_DIR/$KEYPAIR_NAME"

echo "Done."
