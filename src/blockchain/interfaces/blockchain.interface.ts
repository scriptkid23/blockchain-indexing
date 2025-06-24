export enum ChainType {
  EVM = 'evm',
  SOLANA = 'solana',
  SUI = 'sui',
}

export enum EventStrategy {
  WEBSOCKET = 'websocket',
  BLOCK_SCAN = 'block_scan',
  HYBRID = 'hybrid',
}

export interface ChainConfig {
  chainId: number;
  name: string;
  type: ChainType;
  rpcUrl: string;
  wsUrl?: string;
  strategy: EventStrategy;
  scanInterval?: number;
  enabled: boolean;
}

export interface BlockchainEvent {
  chainId: number;
  blockNumber: number;
  transactionHash: string;
  eventType: string;
  contractAddress: string;
  data: any;
  timestamp: number;
}

export interface IBlockchainListener {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export interface IBlockchainSDK {
  chainId: number;
  chainType: ChainType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  createListener(strategy: EventStrategy): IBlockchainListener;
  getLatestBlock(): Promise<number>;
}

export interface IEventHandler {
  handle(event: BlockchainEvent): Promise<void>;
  canHandle(event: BlockchainEvent): boolean;
} 