# Live Network Tests

These tests spin up a real Mina lightnet container with an archive node, wait for blocks to be produced, and run queries against the live archive database.

## Prerequisites

- Docker installed and running
- `o1labs/mina-local-network:compatible-latest-lightnet` image available
  ```bash
  docker pull o1labs/mina-local-network:compatible-latest-lightnet
  ```
- Ports 3085, 5432, 8080, 8181, 8282 must be free

## Running

```bash
npm run test:live-network
```

Expect ~3-5 minutes for network startup + block production before tests execute.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LIGHTNET_IMAGE` | `o1labs/mina-local-network:compatible-latest-lightnet` | Docker image for the lightnet container |
| `LIGHTNET_NETWORK_TYPE` | `single-node` | Network type (`single-node` or `multi-node`) |
| `LIGHTNET_PROOF_LEVEL` | `none` | Proof level (`none` for fast, `full` for real proofs) |
| `LIGHTNET_SLOT_TIME` | `20000` | Block slot time in milliseconds |

## What's tested

| Suite | Tests | Description |
|---|---|---|
| Blocks | 4 | Block production, height ordering, filtering, DESC sort |
| NetworkState | 2 | Max heights for canonical/pending chains |
| Events | 1 | Empty result for address with no zkApp activity |
| Actions | 1 | Empty result for address with no zkApp activity |
| Transactions | 1 | Send payment via daemon, verify it appears in archive |
| Schema | 1 | All required archive tables exist |

## How it works

1. **Setup**: Starts the lightnet Docker container, waits for `SYNCED` status via Mina daemon GraphQL
2. **Block production**: Waits for at least 3 blocks to be produced in the archive
3. **Tests**: Runs all queries against the live PostgreSQL archive database
4. **Transaction test**: Acquires funded accounts from the accounts manager (port 8181), sends a payment, and polls the archive until the transaction appears
5. **Teardown**: Stops and removes the Docker container

## Using with minimina

You can also use [minimina](https://github.com/o1-labs/minimina) to start a network with an archive node:

```bash
minimina network create --topology topology.json --genesis-ledger genesis.json
minimina network start
```

Then run the tests pointing to the correct ports. See the minimina topology files in `/tests/data/large_network/` for examples with archive nodes.
