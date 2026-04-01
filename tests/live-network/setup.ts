/**
 * Live network test setup: starts a Mina lightnet container with archive node.
 *
 * Uses the o1labs/mina-local-network Docker image which bundles:
 * - Mina daemon (block producer)
 * - Mina archive node
 * - PostgreSQL (archive database)
 * - Accounts manager (port 8181)
 *
 * Environment variables:
 * - LIGHTNET_IMAGE: Docker image to use (default: o1labs/mina-local-network:compatible-latest-lightnet)
 * - LIGHTNET_NETWORK_TYPE: single-node or multi-node (default: single-node)
 * - LIGHTNET_PROOF_LEVEL: none or full (default: none)
 * - LIGHTNET_SLOT_TIME: slot time in ms (default: 20000)
 */
import { execSync, exec, ChildProcess } from 'child_process';
import http from 'http';

const LIGHTNET_IMAGE =
  process.env.LIGHTNET_IMAGE ??
  'o1labs/mina-local-network:compatible-latest-lightnet';
const NETWORK_TYPE = process.env.LIGHTNET_NETWORK_TYPE ?? 'single-node';
const PROOF_LEVEL = process.env.LIGHTNET_PROOF_LEVEL ?? 'none';
const SLOT_TIME = process.env.LIGHTNET_SLOT_TIME ?? '20000';
const CONTAINER_NAME = 'archive-node-api-live-test';

// Host ports (offset to avoid clashing with other local services)
export const MINA_GRAPHQL_PORT = Number(process.env.LIGHTNET_GRAPHQL_PORT ?? '28080');
export const POSTGRES_PORT = Number(process.env.LIGHTNET_PG_PORT ?? '25432');
export const ACCOUNTS_MANAGER_PORT = Number(process.env.LIGHTNET_ACCOUNTS_PORT ?? '28181');
export const ARCHIVE_API_PORT = Number(process.env.LIGHTNET_ARCHIVE_PORT ?? '28282');
const MINA_REST_PORT = Number(process.env.LIGHTNET_REST_PORT ?? '23085');

export const PG_CONN = `postgresql://postgres:postgres@localhost:${POSTGRES_PORT}/archive`;

export async function startLightnet(): Promise<void> {
  // Stop any existing container
  try {
    execSync(`docker rm -f ${CONTAINER_NAME} 2>/dev/null`, { stdio: 'pipe' });
  } catch {
    // ignore
  }

  console.log(`Starting lightnet container (${LIGHTNET_IMAGE})...`);
  execSync(
    [
      'docker run -d',
      `--name ${CONTAINER_NAME}`,
      `-e NETWORK_TYPE=${NETWORK_TYPE}`,
      `-e PROOF_LEVEL=${PROOF_LEVEL}`,
      `-e SLOT_TIME=${SLOT_TIME}`,
      `-p ${MINA_GRAPHQL_PORT}:8080`,
      `-p ${POSTGRES_PORT}:5432`,
      `-p ${ACCOUNTS_MANAGER_PORT}:8181`,
      `-p ${ARCHIVE_API_PORT}:8282`,
      `-p ${MINA_REST_PORT}:3085`,
      LIGHTNET_IMAGE,
    ].join(' '),
    { stdio: 'pipe' }
  );

  console.log('Waiting for Mina network readiness...');
  await waitForNetwork(300000); // 5 min timeout
  console.log('Mina network is ready.');
}

export async function stopLightnet(): Promise<void> {
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'pipe' });
  } catch {
    // ignore
  }
}

/**
 * Polls the Mina GraphQL endpoint until the network reports SYNCED status.
 */
async function waitForNetwork(timeoutMs: number): Promise<void> {
  const start = Date.now();
  const pollIntervalMs = 5000;

  while (Date.now() - start < timeoutMs) {
    try {
      const status = await queryDaemonStatus();
      if (status === 'SYNCED') return;
      console.log(`  Network status: ${status}, waiting...`);
    } catch {
      console.log('  Network not ready yet...');
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`Network did not become ready within ${timeoutMs}ms`);
}

async function queryDaemonStatus(): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      query: '{ daemonStatus { syncStatus } }',
    });
    const req = http.request(
      {
        hostname: 'localhost',
        port: MINA_GRAPHQL_PORT,
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 5000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.data?.daemonStatus?.syncStatus ?? 'UNKNOWN');
          } catch {
            reject(new Error('Invalid response'));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.write(body);
    req.end();
  });
}

/**
 * Send a simple payment transaction via the Mina daemon GraphQL.
 */
export async function sendPayment(
  from: string,
  to: string,
  amount: string,
  fee: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      query: `mutation {
        sendPayment(input: {
          from: "${from}",
          to: "${to}",
          amount: "${amount}",
          fee: "${fee}"
        }) {
          payment { hash }
        }
      }`,
    });
    const req = http.request(
      {
        hostname: 'localhost',
        port: MINA_GRAPHQL_PORT,
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.data?.sendPayment?.payment?.hash) {
              resolve(json.data.sendPayment.payment.hash);
            } else {
              reject(
                new Error(
                  `sendPayment failed: ${JSON.stringify(json.errors ?? json)}`
                )
              );
            }
          } catch {
            reject(new Error(`Invalid response from daemon: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Acquire a funded keypair from the lightnet accounts manager.
 */
export async function acquireKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: 'localhost',
        port: ACCOUNTS_MANAGER_PORT,
        path: '/acquire-account',
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.pk && json.sk) {
              resolve({ publicKey: json.pk, privateKey: json.sk });
            } else {
              reject(
                new Error(
                  `acquireKeyPair failed: ${JSON.stringify(json)}`
                )
              );
            }
          } catch (e) {
            reject(new Error(`Invalid response from accounts manager: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

/**
 * Wait for block height to reach a target.
 */
export async function waitForBlockHeight(
  targetHeight: number,
  pgConn: string,
  timeoutMs = 120000
): Promise<void> {
  const pg = await import('postgres');
  const client = pg.default(pgConn);
  const start = Date.now();

  try {
    while (Date.now() - start < timeoutMs) {
      const rows = await client`SELECT max(height) as max_height FROM blocks`;
      const currentHeight = Number(rows[0]?.max_height ?? 0);
      if (currentHeight >= targetHeight) return;
      console.log(
        `  Block height: ${currentHeight}, waiting for ${targetHeight}...`
      );
      await sleep(5000);
    }
    throw new Error(
      `Block height did not reach ${targetHeight} within ${timeoutMs}ms`
    );
  } finally {
    await client.end();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
