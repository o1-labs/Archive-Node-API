import { NetworkState } from '../../blockchain/types.js';

export interface INetworkService {
  getNetworkState(options: unknown): Promise<NetworkState>;
}
