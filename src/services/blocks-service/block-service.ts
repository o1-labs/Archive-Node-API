import type postgres from 'postgres';
import { MaxBlockHeightInfo } from '../../blockchain/types.js';
import { getBlockQuery } from '../../db/sql/events-actions/queries.js';

import { IBlockService } from './block-service.interface.js';
import {
  TracingState,
  extractTraceStateFromOptions,
} from '../../tracing/tracer.js';

export { BlockService };

class BlockService implements IBlockService {
  private readonly client: postgres.Sql;

  constructor(client: postgres.Sql) {
    this.client = client;
  }

  async maxBlockHeightInfo(options: unknown): Promise<MaxBlockHeightInfo> {
    const tracingState = extractTraceStateFromOptions(options);
    return (await this.getMaxBlockHeightInfo({ tracingState })) ?? [];
  }

  async getMaxBlockHeightInfo({
    tracingState,
  }: {
    tracingState: TracingState;
  }): Promise<MaxBlockHeightInfo> {
    const sqlSpan = tracingState.startSpan('block.SQL');
    const rows = await this.executeBlockQuery();
    sqlSpan.end();

    const processingSpan = tracingState.startSpan('block.processing');
    const blockData = {
      canonicalMaxBlockHeight: Number(
        rows.filter((row) => row.chain_status === 'canonical')[0]
      ),
      pendingMaxBlockHeight: Number(
        rows.filter((row) => row.chain_status === 'pending')[0]
      ),
    };
    processingSpan.end();
    return blockData;
  }

  private async executeBlockQuery() {
    return getBlockQuery(this.client);
  }
}
