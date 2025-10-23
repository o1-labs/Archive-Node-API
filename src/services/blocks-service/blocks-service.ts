import type postgres from 'postgres';
import { Blocks } from '../../blockchain/types.js';
import type {
  BlockQueryInput,
  BlockSortByInput,
} from '../../resolvers-types.js';
import { IBlocksService } from './blocks-service.interface.js';
import {
  TracingState,
  extractTraceStateFromOptions,
} from '../../tracing/tracer.js';
import { BLOCK_RANGE_SIZE } from '../../server/server.js';

export { BlocksService };

// Interface representing the expected row structure from the database
interface BlockRow {
  id: number;
  height: number;
  creator: string;
  state_hash: string;
  timestamp: string;
  internal_command_type?: string;
  coinbase_amount?: string;
}

class BlocksService implements IBlocksService {
  private readonly client: postgres.Sql;

  constructor(client: postgres.Sql) {
    this.client = client;
  }

  async getBlocks(
    query: BlockQueryInput | null | undefined,
    limit: number | null | undefined,
    sortBy: BlockSortByInput | null | undefined,
    options: unknown
  ): Promise<Blocks> {
    const tracingState = extractTraceStateFromOptions(options);
    return (await this.getBlockData(query, limit, sortBy, { tracingState })) ?? [];
  }

  async getBlockData(
    query: BlockQueryInput | null | undefined,
    limit: number | null | undefined,
    sortBy: BlockSortByInput | null | undefined,
    { tracingState }: { tracingState: TracingState }
  ): Promise<Blocks> {
    const sqlSpan = tracingState.startSpan('blocks.SQL');
    const rows = await this.executeBlocksQuery(query, limit, sortBy);
    sqlSpan.end();

    const processingSpan = tracingState.startSpan('blocks.processing');
    const blocks = this.rowsToBlocks(rows as unknown as BlockRow[]);
    processingSpan.end();
    return blocks;
  }

  private async executeBlocksQuery(
    query: BlockQueryInput | null | undefined,
    limit: number | null | undefined,
    sortBy: BlockSortByInput | null | undefined
  ) {
    const dateTimeGte = query?.dateTime_gte;
    const dateTimeLt = query?.dateTime_lt;
    const canonical = query?.canonical ?? false;
    const orderBy = sortBy === 'BLOCKHEIGHT_DESC' ? 'DESC' : 'ASC';
    const limitValue = Math.min(limit ?? 200, BLOCK_RANGE_SIZE);

    // Build the SQL query for blocks with transactions
    // Archive Node uses a junction table blocks_internal_commands
    let sql = `
      SELECT
        b.id,
        b.state_hash,
        b.height,
        b.timestamp,
        pk.value as creator,
        COALESCE(ic.fee, '0') as coinbase_amount
      FROM blocks b
      INNER JOIN public_keys pk ON b.creator_id = pk.id
      LEFT JOIN (
        SELECT
          bic.block_id,
          ic.fee
        FROM internal_commands ic
        INNER JOIN blocks_internal_commands bic ON ic.id = bic.internal_command_id
        WHERE ic.command_type = 'coinbase'
      ) AS ic ON b.id = ic.block_id
      WHERE 1=1
    `;

    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (canonical) {
      sql += ` AND b.chain_status = 'canonical'`;
    }

    if (dateTimeGte) {
      // Convert ISO timestamp to Unix milliseconds
      const timestampMs = new Date(dateTimeGte).getTime().toString();
      sql += ` AND b.timestamp >= $${paramIndex}`;
      params.push(timestampMs);
      paramIndex++;
    }

    if (dateTimeLt) {
      // Convert ISO timestamp to Unix milliseconds
      const timestampMs = new Date(dateTimeLt).getTime().toString();
      sql += ` AND b.timestamp < $${paramIndex}`;
      params.push(timestampMs);
      paramIndex++;
    }

    sql += ` ORDER BY b.height ${orderBy}`;
    sql += ` LIMIT $${paramIndex}`;
    params.push(limitValue);

    return this.client.unsafe(sql, params);
  }

  private rowsToBlocks(rows: BlockRow[]): Blocks {
    return rows.map((row) => ({
      blockHeight: row.height,
      creator: row.creator,
      stateHash: row.state_hash,
      dateTime: new Date(parseInt(row.timestamp)).toISOString(),
      transactions: {
        coinbase: row.coinbase_amount || '0',
      },
    }));
  }
}
