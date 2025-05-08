import { gql } from 'graphql-tag';
import { GraphQLClient } from 'graphql-request';
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { NetworkState } from 'src/blockchain/types.js';

const K = 290; // Consensus parameter meaning length of chain required for a block to become canonical
const endpoint =
  process.env.STAGING_GRAPHQL_ENDPOINT ||
  'http://archive-node-api.gcp.o1test.net/';
const client = new GraphQLClient(endpoint);

const networkStateQuery = gql`
  query {
    networkState {
      maxBlockHeight {
        canonicalMaxBlockHeight
        pendingMaxBlockHeight
      }
    }
  }
`;

describe('Network State', () => {
  it('should return the network state', async () => {
    const data: { networkState: NetworkState } =
      await client.request(networkStateQuery);
    const { maxBlockHeight } = data.networkState;
    const { canonicalMaxBlockHeight, pendingMaxBlockHeight } = maxBlockHeight;

    assert.strictEqual(pendingMaxBlockHeight - canonicalMaxBlockHeight, K);
  });
});
