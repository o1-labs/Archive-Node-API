import type postgres from 'postgres';
import {
  Blocks,
  UserCommand,
  ZkAppCommand,
  FeeTransfer,
} from '../../blockchain/types.js';
import type {
  BlockQueryInput,
  BlockSortByInput,
} from '../../resolvers-types.js';
import { IBlocksService } from './blocks-service.interface.js';
import {
  TracingState,
  extractTraceStateFromOptions,
} from '../../tracing/tracer.js';
import {
  BLOCK_RANGE_SIZE,
  ENABLE_BLOCK_TRANSACTION_DETAILS,
} from '../../server/server.js';

export { BlocksService };
export type { BlockRow, UserCommandRow, ZkAppCommandRow, FeeTransferRow };

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

interface UserCommandRow {
  block_id: number;
  hash: string;
  kind: string;
  from: string;
  to: string;
  amount: string;
  fee: string;
  memo: string;
  nonce: number;
  status: string;
  failure_reason: string | null;
}

interface ZkAppCommandRow {
  block_id: number;
  hash: string;
  fee_payer: string;
  fee: string;
  memo: string;
  status: string;
  failure_reasons_ids: string | null;
}

interface FeeTransferRow {
  block_id: number;
  recipient: string;
  fee: string;
  type: string;
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

    const blockRows = rows as unknown as BlockRow[];

    let userCommandsByBlock = new Map<number, UserCommand[]>();
    let zkappCommandsByBlock = new Map<number, ZkAppCommand[]>();
    let feeTransfersByBlock = new Map<number, FeeTransfer[]>();

    if (ENABLE_BLOCK_TRANSACTION_DETAILS && blockRows.length > 0) {
      const txSpan = tracingState.startSpan('blocks.transactionDetails.SQL');
      const blockIds = blockRows.map((r) => r.id);
      [userCommandsByBlock, zkappCommandsByBlock, feeTransfersByBlock] =
        await this.fetchTransactionDetails(blockIds);
      txSpan.end();
    }

    const processingSpan = tracingState.startSpan('blocks.processing');
    const blocks = this.rowsToBlocks(
      blockRows,
      userCommandsByBlock,
      zkappCommandsByBlock,
      feeTransfersByBlock
    );
    processingSpan.end();
    return blocks;
  }

  private async executeBlocksQuery(
    query: BlockQueryInput | null | undefined,
    limit: number | null | undefined,
    sortBy: BlockSortByInput | null | undefined
  ) {
    const blockHeightGte = query?.blockHeight_gte;
    const blockHeightLt = query?.blockHeight_lt;
    const dateTimeGte = query?.dateTime_gte;
    const dateTimeLt = query?.dateTime_lt;
    const canonical = query?.canonical;
    const inBestChain = query?.inBestChain;
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
      WHERE TRUE
    `;

    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (canonical === true) {
      sql += ` AND b.chain_status = 'canonical'`;
    } else if (canonical === false) {
      sql += ` AND b.chain_status <> 'canonical'`;
    }

    if (blockHeightGte) {
      sql += ` AND b.height >= $${paramIndex}`;
      params.push(blockHeightGte);
      paramIndex++;
    }

    if (blockHeightLt) {
      sql += ` AND b.height < $${paramIndex}`;
      params.push(blockHeightLt);
      paramIndex++;
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

    const best_chain_til_canonical_cte =
      `
        WITH RECURSIVE best_chain_til_canonical AS (
            SELECT
                id,
                parent_id,
                height
            FROM blocks
            WHERE height = (SELECT MAX(height) FROM blocks)
            AND chain_status = 'pending'

            UNION

            SELECT
               potential_parent.id,
               potential_parent.parent_id,
               potential_parent.height
            FROM blocks potential_parent
            JOIN best_chain_til_canonical ON potential_parent.id = best_chain_til_canonical.parent_id
            WHERE potential_parent.chain_status <> 'canonical'
        )
        `
    if (inBestChain === true) {
      sql =
        best_chain_til_canonical_cte
        + sql
        + ` AND (b.id IN (SELECT id FROM best_chain_til_canonical) OR b.chain_status = 'canonical')`;
    } else if (inBestChain === false) {
      sql =
        best_chain_til_canonical_cte
        + sql
        + ` AND (b.id NOT IN (SELECT id FROM best_chain_til_canonical)
                 OR b.chain_status = 'orphaned')`;

    }

    sql += ` ORDER BY b.height ${orderBy}`;
    sql += ` LIMIT $${paramIndex}`;
    params.push(limitValue);

    return this.client.unsafe(sql, params);
  }

  private async fetchTransactionDetails(
    blockIds: number[]
  ): Promise<
    [
      Map<number, UserCommand[]>,
      Map<number, ZkAppCommand[]>,
      Map<number, FeeTransfer[]>,
    ]
  > {
    const [ucRows, zkRows, ftRows] = await Promise.all([
      this.fetchUserCommands(blockIds),
      this.fetchZkAppCommands(blockIds),
      this.fetchFeeTransfers(blockIds),
    ]);

    return [
      this.groupBy(
        ucRows as unknown as UserCommandRow[],
        (r) => r.block_id,
        this.mapUserCommandRow
      ),
      this.groupBy(
        zkRows as unknown as ZkAppCommandRow[],
        (r) => r.block_id,
        this.mapZkAppCommandRow
      ),
      this.groupBy(
        ftRows as unknown as FeeTransferRow[],
        (r) => r.block_id,
        this.mapFeeTransferRow
      ),
    ];
  }

  private async fetchUserCommands(blockIds: number[]) {
    const sql = `
      SELECT
        buc.block_id,
        uc.hash,
        uc.command_type AS kind,
        pk_from.value AS "from",
        pk_to.value AS "to",
        COALESCE(uc.amount, '0') AS amount,
        uc.fee,
        uc.memo,
        uc.nonce,
        buc.status,
        buc.failure_reason
      FROM blocks_user_commands buc
      INNER JOIN user_commands uc ON buc.user_command_id = uc.id
      INNER JOIN public_keys pk_from ON uc.source_id = pk_from.id
      INNER JOIN public_keys pk_to ON uc.receiver_id = pk_to.id
      WHERE buc.block_id = ANY($1)
      ORDER BY buc.block_id, buc.sequence_no
    `;
    return this.client.unsafe(sql, [blockIds]);
  }

  private async fetchZkAppCommands(blockIds: number[]) {
    const sql = `
      SELECT
        bzkc.block_id,
        zkc.hash,
        pk_fee.value AS fee_payer,
        fpb.fee,
        zkc.memo,
        bzkc.status,
        bzkc.failure_reasons_ids
      FROM blocks_zkapp_commands bzkc
      INNER JOIN zkapp_commands zkc ON bzkc.zkapp_command_id = zkc.id
      INNER JOIN zkapp_fee_payer_body fpb ON zkc.zkapp_fee_payer_body_id = fpb.id
      INNER JOIN public_keys pk_fee ON fpb.public_key_id = pk_fee.id
      WHERE bzkc.block_id = ANY($1)
      ORDER BY bzkc.block_id, bzkc.sequence_no
    `;
    return this.client.unsafe(sql, [blockIds]);
  }

  private async fetchFeeTransfers(blockIds: number[]) {
    const sql = `
      SELECT
        bic.block_id,
        pk.value AS recipient,
        ic.fee,
        ic.command_type AS type
      FROM blocks_internal_commands bic
      INNER JOIN internal_commands ic ON bic.internal_command_id = ic.id
      INNER JOIN public_keys pk ON ic.receiver_id = pk.id
      WHERE bic.block_id = ANY($1)
        AND ic.command_type IN ('fee_transfer', 'fee_transfer_via_coinbase')
      ORDER BY bic.block_id, bic.sequence_no
    `;
    return this.client.unsafe(sql, [blockIds]);
  }

  groupBy<TRow, TResult>(
    rows: TRow[],
    keyFn: (row: TRow) => number,
    mapFn: (row: TRow) => TResult
  ): Map<number, TResult[]> {
    const map = new Map<number, TResult[]>();
    for (const row of rows) {
      const key = keyFn(row);
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push(mapFn(row));
    }
    return map;
  }

  mapUserCommandRow(row: UserCommandRow): UserCommand {
    return {
      hash: row.hash,
      kind: row.kind,
      from: row.from,
      to: row.to,
      amount: row.amount,
      fee: row.fee,
      memo: row.memo,
      nonce: row.nonce,
      status: row.status,
      failureReason: row.failure_reason,
    };
  }

  mapZkAppCommandRow(row: ZkAppCommandRow): ZkAppCommand {
    return {
      hash: row.hash,
      feePayer: row.fee_payer,
      fee: row.fee,
      memo: row.memo,
      status: row.status,
      failureReason: row.failure_reasons_ids,
    };
  }

  mapFeeTransferRow(row: FeeTransferRow): FeeTransfer {
    return {
      recipient: row.recipient,
      fee: row.fee,
      type: row.type,
    };
  }

  rowsToBlocks(
    rows: BlockRow[],
    userCommandsByBlock: Map<number, UserCommand[]> = new Map(),
    zkappCommandsByBlock: Map<number, ZkAppCommand[]> = new Map(),
    feeTransfersByBlock: Map<number, FeeTransfer[]> = new Map()
  ): Blocks {
    return rows.map((row) => ({
      blockHeight: row.height,
      creator: row.creator,
      stateHash: row.state_hash,
      dateTime: new Date(parseInt(row.timestamp)).toISOString(),
      transactions: {
        coinbase: row.coinbase_amount || '0',
        userCommands: userCommandsByBlock.get(row.id) ?? [],
        zkappCommands: zkappCommandsByBlock.get(row.id) ?? [],
        feeTransfer: feeTransfersByBlock.get(row.id) ?? [],
      },
    }));
  }
}
