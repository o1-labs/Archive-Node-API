import type postgres from 'postgres';
import { Blocks, Block, BlockTransaction } from '../../blockchain/types.js';
import type {
  BlockQueryInput,
  BlockSortByInput,
} from '../../resolvers-types.js';
import { IBlocksService } from './blocks-service.interface.js';
import {
  TracingState,
  extractTraceStateFromOptions,
} from '../../tracing/tracer.js';

export { BlocksService };

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
    const blocks = this.rowsToBlocks(rows);
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
    const limitValue = limit ?? 100;

    // Build the SQL query for blocks with transactions
    // Archive Node uses a junction table blocks_internal_commands
    let sql = `
      SELECT 
        b.id,
        b.state_hash,
        b.height,
        b.timestamp,
        b.creator_id,
        b.chain_status,
        pk.value as creator,
        ic.command_type as internal_command_type,
        ic.fee as coinbase_amount
      FROM blocks b
      INNER JOIN public_keys pk ON b.creator_id = pk.id
      LEFT JOIN blocks_internal_commands bic ON bic.block_id = b.id
      LEFT JOIN internal_commands ic ON ic.id = bic.internal_command_id AND ic.command_type = 'coinbase'
      WHERE 1=1
    `;

    const params: any[] = [];
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

  private rowsToBlocks(rows: any[]): Blocks {
    // Group rows by block
    const blockMap = new Map<number, Block>();

    for (const row of rows) {
      const blockId = row.id;

      if (!blockMap.has(blockId)) {
        // Convert Unix milliseconds to ISO string
        const dateTime = new Date(parseInt(row.timestamp)).toISOString();
        blockMap.set(blockId, {
          blockHeight: row.height,
          creator: row.creator,
          stateHash: row.state_hash,
          dateTime: dateTime,
          transactions: [],
        });
      }

      const block = blockMap.get(blockId)!;

      // Add coinbase transaction if exists
      // coinbase_amount is in nanomina (1 MINA = 10^9 nanomina)
      if (row.internal_command_type === 'coinbase' && row.coinbase_amount) {
        block.transactions.push({
          coinbase: row.coinbase_amount,
        });
      }
    }

    return Array.from(blockMap.values());
  }
}
