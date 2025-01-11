import type postgres from 'postgres';
import { MaxBlockHeightInfo, NetworkState } from '../../blockchain/types.js';
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
    return (await this.getNetworkStateData({ tracingState })) ?? [];
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
    const maxBlockHeightInfo = {
      canonicalMaxBlockHeight: Number(
        rows.filter((row) => row.chain_status === 'canonical')[0].height
      ),
      pendingMaxBlockHeight: Number(
        rows.filter((row) => row.chain_status === 'pending')[0].height
      ),
    };
    const networkState = {
      maxBlockHeight: maxBlockHeightInfo
    }
    processingSpan.end();
    return networkState;
  }

  private async executeNetworkStateQuery() {
    return getNetworkStateQuery(this.client);
  }
}
