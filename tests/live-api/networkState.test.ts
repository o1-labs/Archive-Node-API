import { gql } from 'graphql-tag';
import { GraphQLClient } from 'graphql-request';
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { NetworkState } from 'src/blockchain/types.js';
import { endpoint } from './endpoint.js';

const K = 290; // Consensus parameter meaning length of chain required for a block to become canonical

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
    assert.ok(maxBlockHeight, 'staging archive should have indexed blocks');
    const { canonicalMaxBlockHeight, pendingMaxBlockHeight } = maxBlockHeight;

    assert.strictEqual(pendingMaxBlockHeight - canonicalMaxBlockHeight, K);
  });
});
