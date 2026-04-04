import { gql } from 'graphql-tag';
import { GraphQLClient } from 'graphql-request';
import assert from 'node:assert';
import { describe, it } from 'node:test';

const endpoint =
  process.env.STAGING_GRAPHQL_ENDPOINT ||
  'http://archive-node-api.gcp.o1test.net/';
const client = new GraphQLClient(endpoint);

const blocksQuery = gql`
  query getBlocks($limit: Int, $sortBy: BlockSortByInput) {
    blocks(limit: $limit, sortBy: $sortBy) {
      blockHeight
      creator
      stateHash
      dateTime
      transactions {
        coinbase
        userCommands {
          hash
          kind
          from
          to
          amount
          fee
          memo
          nonce
          status
          failureReason
        }
        zkappCommands {
          hash
          feePayer
          fee
          memo
          status
          failureReason
        }
        feeTransfer {
          recipient
          fee
          type
        }
      }
    }
  }
`;

const blocksQueryWithFilter = gql`
  query getBlocksFiltered(
    $query: BlockQueryInput
    $limit: Int
    $sortBy: BlockSortByInput
  ) {
    blocks(query: $query, limit: $limit, sortBy: $sortBy) {
      blockHeight
      creator
      stateHash
      dateTime
      transactions {
        coinbase
      }
    }
  }
`;

describe('Blocks', () => {
  it('should return blocks with correct shape and coinbase', async () => {
    const data: { blocks: any[] } = await client.request(blocksQuery, {
      limit: 5,
      sortBy: 'BLOCKHEIGHT_DESC',
    });

    assert(data.blocks.length > 0, 'Expected at least one block');
    assert(data.blocks.length <= 5, 'Expected at most 5 blocks');

    for (const block of data.blocks) {
      assert.strictEqual(typeof block.blockHeight, 'number');
      assert.strictEqual(typeof block.creator, 'string');
      assert.strictEqual(typeof block.stateHash, 'string');
      assert.strictEqual(typeof block.dateTime, 'string');
      assert.strictEqual(typeof block.transactions.coinbase, 'string');
      assert(block.transactions.coinbase.length > 0, 'Coinbase should not be empty');
      assert(Array.isArray(block.transactions.userCommands));
      assert(Array.isArray(block.transactions.zkappCommands));
      assert(Array.isArray(block.transactions.feeTransfer));
    }
  });

  it('should sort blocks descending by block height', async () => {
    const data: { blocks: any[] } = await client.request(blocksQueryWithFilter, {
      limit: 5,
      sortBy: 'BLOCKHEIGHT_DESC',
    });

    for (let i = 1; i < data.blocks.length; i++) {
      assert(
        data.blocks[i - 1].blockHeight >= data.blocks[i].blockHeight,
        `Block at index ${i - 1} (height ${data.blocks[i - 1].blockHeight}) should be >= block at index ${i} (height ${data.blocks[i].blockHeight})`
      );
    }
  });

  it('should sort blocks ascending by block height', async () => {
    const data: { blocks: any[] } = await client.request(blocksQueryWithFilter, {
      limit: 5,
      sortBy: 'BLOCKHEIGHT_ASC',
    });

    for (let i = 1; i < data.blocks.length; i++) {
      assert(
        data.blocks[i - 1].blockHeight <= data.blocks[i].blockHeight,
        `Block at index ${i - 1} (height ${data.blocks[i - 1].blockHeight}) should be <= block at index ${i} (height ${data.blocks[i].blockHeight})`
      );
    }
  });

  it('should filter blocks by height range', async () => {
    // First get the latest block height
    const latest: { blocks: any[] } = await client.request(
      blocksQueryWithFilter,
      { limit: 1, sortBy: 'BLOCKHEIGHT_DESC' }
    );
    const maxHeight = latest.blocks[0].blockHeight;
    const from = maxHeight - 5;
    const to = maxHeight;

    const data: { blocks: any[] } = await client.request(blocksQueryWithFilter, {
      query: { blockHeight_gte: from, blockHeight_lt: to },
      limit: 100,
      sortBy: 'BLOCKHEIGHT_ASC',
    });

    for (const block of data.blocks) {
      assert(
        block.blockHeight >= from && block.blockHeight < to,
        `Block height ${block.blockHeight} should be in range [${from}, ${to})`
      );
    }
  });
});
