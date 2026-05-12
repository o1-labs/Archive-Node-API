import type postgres from 'postgres';
import { NetworkState } from '../../blockchain/types.js';
import { getNetworkStateQuery } from '../../db/sql/events-actions/queries.js';

import { INetworkService } from './network-service.interface.js';
import {
  TracingState,
  extractTraceStateFromOptions,
} from '../../tracing/tracer.js';

export { NetworkService };

class NetworkService implements INetworkService {
  private readonly client: postgres.Sql;

  constructor(client: postgres.Sql) {
    this.client = client;
  }

  async getNetworkState(options: unknown): Promise<NetworkState> {
    const tracingState = extractTraceStateFromOptions(options);
    return this.getNetworkStateData({ tracingState });
  }

  async getNetworkStateData({
    tracingState,
  }: {
    tracingState: TracingState;
  }): Promise<NetworkState> {
    const sqlSpan = tracingState.startSpan('networkState.SQL');
    const rows = await this.executeNetworkStateQuery();
    sqlSpan.end();

    const processingSpan = tracingState.startSpan('networkState.processing');

    // The SQL returns at most one row per chain_status. Either row may be
    // missing on a fresh archive or against a static fixture, so don't
    // assume both are present.
    const canonicalRow = rows.find((r) => r.chain_status === 'canonical');
    const pendingRow = rows.find((r) => r.chain_status === 'pending');

    // No data at all: surface as maxBlockHeight=null. The schema allows it
    // (NetworkStateOutput.maxBlockHeight is nullable) and it's a clearer
    // signal to clients than fake zeroes.
    if (!canonicalRow && !pendingRow) {
      processingSpan.end();
      return { maxBlockHeight: null };
    }

    // canonical ≤ pending by definition. When one side is missing, fall back
    // so the schema's non-null Int! contract is honored without lying:
    //   - missing canonical → 0 (no block has been finalized yet)
    //   - missing pending   → equal to canonical (archive is fully quiesced)
    const canonicalMaxBlockHeight = canonicalRow ? Number(canonicalRow.height) : 0;
    const pendingMaxBlockHeight = pendingRow
      ? Number(pendingRow.height)
      : canonicalMaxBlockHeight;

    processingSpan.end();
    return {
      maxBlockHeight: {
        canonicalMaxBlockHeight,
        pendingMaxBlockHeight,
      },
    };
  }

  private async executeNetworkStateQuery() {
    return getNetworkStateQuery(this.client);
  }
}
