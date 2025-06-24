import { Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import {
  IBlockchainListener,
  BlockchainEvent,
  ChainConfig,
} from '../../interfaces/blockchain.interface';
import { EventDispatcherService } from '../../core/event-dispatcher.service';
import { ContractConfigService } from '../../services/contract-config.service';
import { ContractConfig } from '../../schemas/contract-config.schema';

export class EvmBlockScanListener implements IBlockchainListener {
  private readonly logger = new Logger(EvmBlockScanListener.name);
  private _isRunning = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private lastProcessedBlock = 0;
  private readonly scanIntervalMs: number;
  private readonly blocksPerScan: number;
  private contractConfigs: ContractConfig[] = [];
  private contractAddresses: Set<string> = new Set();
  private eventSignatures: Set<string> = new Set();
  private contractRefreshTimer: NodeJS.Timeout | null = null;
  private readonly contractRefreshInterval = 30000; // 30 seconds
  private readonly batchSize = 3; // Process 3 contracts per batch
  private readonly batchDelay = 500; // 500ms delay between batches
  private rpcRequestCount = 0;
  private lastCounterResetTime = Date.now();

  constructor(
    private readonly chainId: number,
    private readonly provider: ethers.JsonRpcProvider,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly config: ChainConfig,
    private readonly contractConfigService: ContractConfigService,
  ) {
    this.scanIntervalMs = config.scanInterval || 5000; // Default 5 seconds
    this.blocksPerScan = parseInt(process.env.BLOCKS_PER_SCAN || '50', 10); // Configurable batch size
  }

  async start(): Promise<void> {
    if (this._isRunning) {
      this.logger.warn(
        `Dynamic block scan listener for chain ${this.chainId} is already running`,
      );
      return;
    }

    try {
      // Load contracts and initialize
      await this.loadContracts();

      // Initialize starting block
      if (this.lastProcessedBlock === 0) {
        this.lastProcessedBlock = await this.provider.getBlockNumber();
        this.logger.log(
          `Starting block scan from block ${this.lastProcessedBlock} for chain ${this.chainId}`,
        );
      }

      this._isRunning = true;
      this.startScanning();
      this.startContractRefreshTimer();

      this.logger.log(
        `Started dynamic block scan listener for chain ${this.chainId} (interval: ${this.scanIntervalMs}ms, contracts: ${this.contractConfigs.length})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start dynamic block scan listener for chain ${this.chainId}:`,
        error,
      );
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this._isRunning) {
      this.logger.warn(
        `Dynamic block scan listener for chain ${this.chainId} is not running`,
      );
      return;
    }

    this._isRunning = false;

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    if (this.contractRefreshTimer) {
      clearInterval(this.contractRefreshTimer);
      this.contractRefreshTimer = null;
    }

    this.logger.log(
      `Stopped dynamic block scan listener for chain ${this.chainId}`,
    );
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  // Utility functions for batch processing
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private chunks<T>(array: T[], chunkSize: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      result.push(array.slice(i, i + chunkSize));
    }
    return result;
  }

  private async processBatches<T, R>(
    items: T[],
    processFn: (batch: T[]) => Promise<R[]>,
    batchSize: number = this.batchSize,
    delayMs: number = this.batchDelay,
  ): Promise<R[]> {
    let results: R[] = [];
    const batches = this.chunks(items, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batchResults = await processFn(batches[i]);
      results = [...results, ...batchResults];

      // Add delay between batches (except after the last batch)
      if (i < batches.length - 1) {
        await this.sleep(delayMs);
      }
    }

    return results;
  }

  private trackRpcRequest(): void {
    this.rpcRequestCount++;
    const currentTime = Date.now();
    const COUNTER_INTERVAL_MS = 10000; // 10 seconds

    if (currentTime - this.lastCounterResetTime >= COUNTER_INTERVAL_MS) {
      this.logger.debug(`🔗 RPC Requests in last 10s: ${this.rpcRequestCount}`);
      this.rpcRequestCount = 0;
      this.lastCounterResetTime = currentTime;
    }
  }

  private async loadContracts(): Promise<void> {
    try {
      this.contractConfigs =
        await this.contractConfigService.getEnabledContractsByChain(
          this.chainId,
        );

      // Update contract addresses and event signatures sets for fast lookup
      this.contractAddresses.clear();
      this.eventSignatures.clear();

      for (const config of this.contractConfigs) {
        this.contractAddresses.add(config.address.toLowerCase());
        for (const eventSig of config.events) {
          this.eventSignatures.add(eventSig);
        }
      }

      this.logger.log(
        `Loaded ${this.contractConfigs.length} contracts for dynamic block scanning on chain ${this.chainId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error loading contracts for chain ${this.chainId}:`,
        error,
      );
      throw error;
    }
  }

  private startScanning(): void {
    this.scanInterval = setInterval(async () => {
      if (!this.isRunning()) return;

      try {
        await this.scanForNewBlocks();
      } catch (error) {
        this.logger.error(
          `Error during block scan for chain ${this.chainId}:`,
          error,
        );
      }
    }, this.scanIntervalMs);
  }

  private startContractRefreshTimer(): void {
    this.contractRefreshTimer = setInterval(async () => {
      if (!this.isRunning()) return;

      try {
        await this.loadContracts();
        this.logger.debug(
          `Refreshed contracts for block scan on chain ${this.chainId}`,
        );
      } catch (error) {
        this.logger.error(
          `Error refreshing contracts for chain ${this.chainId}:`,
          error,
        );
      }
    }, this.contractRefreshInterval);
  }

  private async scanForNewBlocks(): Promise<void> {
    try {
      this.trackRpcRequest();
      const latestBlock = await this.provider.getBlockNumber();

      if (latestBlock <= this.lastProcessedBlock) {
        this.logger.debug(
          `📊 No new blocks to process for chain ${this.chainId}. Latest: ${latestBlock}, Last processed: ${this.lastProcessedBlock}`,
        );
        return;
      }

      const startBlock = this.lastProcessedBlock + 1;
      const endBlock = Math.min(
        latestBlock,
        startBlock + this.blocksPerScan - 1,
      );

      this.logger.log(
        `🔍 Scanning blocks ${startBlock} to ${endBlock} for chain ${this.chainId} (${endBlock - startBlock + 1} blocks)`,
      );

      // Use efficient batch processing for event extraction
      await this.processBlockRangeWithBatching(startBlock, endBlock);

      this.lastProcessedBlock = endBlock;

      if (endBlock < latestBlock) {
        this.logger.debug(
          `⏳ More blocks to process for chain ${this.chainId}. Will continue in next scan.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ Error scanning for new blocks on chain ${this.chainId}:`,
        error,
      );
    }
  }

  private async processBlockRangeWithBatching(
    fromBlock: number,
    toBlock: number,
  ): Promise<void> {
    try {
      if (this.contractConfigs.length === 0) {
        this.logger.debug('📭 No contracts to monitor, skipping block range processing');
        return;
      }

      // Get all events from all contracts in the block range using batch processing
      const allEvents = await this.getAllContractEventsInRange(
        fromBlock,
        toBlock,
      );

      if (allEvents.length > 0) {
        // Group events by type for logging
        const eventTypes = allEvents.reduce((acc, event) => {
          acc[event.eventName] = (acc[event.eventName] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        this.logger.log(
          `🎯 Found ${allEvents.length} events in blocks ${fromBlock}-${toBlock}:`,
        );
        Object.entries(eventTypes).forEach(([eventName, count]) => {
          this.logger.log(`  📋 ${eventName}: ${count}`);
        });

        // Process each event
        for (const event of allEvents) {
          if (!this.isRunning()) break;
          await this.processContractEvent(event);
        }
      } else {
        this.logger.debug(
          `📭 No events found in blocks ${fromBlock}-${toBlock} for chain ${this.chainId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ Error processing block range ${fromBlock}-${toBlock} on chain ${this.chainId}:`,
        error,
      );
    }
  }

  private async getAllContractEventsInRange(
    fromBlock: number,
    toBlock: number,
  ): Promise<Array<{
    eventName: string;
    blockNumber: number;
    transactionHash: string;
    args: any[];
    timestamp: number;
    logIndex: number;
    transactionIndex: number;
    contractConfig: ContractConfig;
  }>> {
    const allEvents: any[] = [];

    // Process contracts in batches to avoid rate limiting
    await this.processBatches(
      this.contractConfigs,
      async (batchConfigs) => {
        const contractPromises = batchConfigs.map(async (config) => {
          try {
            const contract = new ethers.Contract(
              config.address,
              config.abi,
              this.provider,
            );

            // Get event names from config
            const eventNames = this.getEventNamesFromConfig(config);

            // Process events for this contract in batches
            const contractEvents = await this.processBatches(
              eventNames,
              async (batchEventNames) => {
                const eventPromises = batchEventNames.map(async (eventName) => {
                  try {
                    this.trackRpcRequest();
                    const filter = (contract.filters as any)[eventName]?.();
                    if (!filter) return [];

                    const events = await contract.queryFilter(
                      filter,
                      fromBlock,
                      toBlock,
                    );

                    return events.map((event) => ({
                      eventName,
                      blockNumber: event.blockNumber,
                      transactionHash: event.transactionHash,
                      args: this.decodeEventData(event, config, eventName),
                      timestamp: 0, // Will be filled later
                      logIndex: event.index,
                      transactionIndex: event.transactionIndex,
                      contractConfig: config,
                    }));
                  } catch (error) {
                    this.logger.warn(
                      `⚠️ Failed to query ${eventName} events for ${config.symbol}:`,
                      error,
                    );
                    return [];
                  }
                });

                return (await Promise.all(eventPromises)).flat();
              },
              2, // 2 events per batch
              300, // 300ms delay
            );

            return contractEvents;
          } catch (error) {
            this.logger.error(
              `❌ Failed to process contract ${config.symbol}:`,
              error,
            );
            return [];
          }
        });

        const batchResults = await Promise.all(contractPromises);
        allEvents.push(...batchResults.flat());

        return [];
      },
      this.batchSize, // Use configured batch size
      this.batchDelay, // Use configured delay
    );

    // Sort events by block number and log index
    allEvents.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber - b.blockNumber;
      }
      return a.logIndex - b.logIndex;
    });

    // Get block timestamps in batches
    const uniqueBlocks = [...new Set(allEvents.map((e) => e.blockNumber))];
    const blockTimestamps = new Map<number, number>();

    await this.processBatches(
      uniqueBlocks,
      async (batchBlocks) => {
        const blockPromises = batchBlocks.map(async (blockNumber) => {
          try {
            this.trackRpcRequest();
            const block = await this.provider.getBlock(blockNumber);
            return { number: blockNumber, timestamp: block?.timestamp || 0 };
          } catch (error) {
            this.logger.warn(`⚠️ Failed to get block ${blockNumber}:`, error);
            return { number: blockNumber, timestamp: 0 };
          }
        });

        const blocks = await Promise.all(blockPromises);
        blocks.forEach((block) => {
          blockTimestamps.set(block.number, block.timestamp);
        });

        return [];
      },
      5, // 5 blocks per batch
      200, // 200ms delay
    );

    // Add timestamps to events
    return allEvents.map((event) => ({
      ...event,
      timestamp: (blockTimestamps.get(event.blockNumber) || 0) * 1000,
    }));
  }

  private getEventNamesFromConfig(config: ContractConfig): string[] {
    // Parse event names from signature hashes
    const knownEvents: { [key: string]: string } = {
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef': 'Transfer',
      '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925': 'Approval',
    };

    return config.events
      .map((eventSig) => knownEvents[eventSig])
      .filter(Boolean);
  }

  private async processContractEvent(event: {
    eventName: string;
    blockNumber: number;
    transactionHash: string;
    args: any[];
    timestamp: number;
    logIndex: number;
    transactionIndex: number;
    contractConfig: ContractConfig;
  }): Promise<void> {
    try {
      // Get transaction receipt for additional data
      this.trackRpcRequest();
      const receipt = await this.provider.getTransactionReceipt(
        event.transactionHash,
      );
      if (!receipt) {
        this.logger.warn(
          `Transaction receipt not found for ${event.transactionHash}`,
        );
        return;
      }

      // Create blockchain event
      const blockchainEvent: BlockchainEvent = {
        chainId: this.chainId,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        eventType: 'contract_log',
        contractAddress: event.contractConfig.address,
        data: {
          topics: [], // Will be filled if needed
          data: '0x',
          logIndex: event.logIndex,
          transactionIndex: event.transactionIndex,
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status,
          contract: {
            name: event.contractConfig.name,
            symbol: event.contractConfig.symbol,
            type: event.contractConfig.type,
          },
          event: {
            name: event.eventName,
            signature: this.getEventSignature(event.eventName),
            args: this.formatEventArgs(
              event.eventName,
              event.args,
              event.contractConfig,
            ),
          },
        },
        timestamp: event.timestamp,
      };

      this.logger.log(
        `${event.contractConfig.symbol} ${event.eventName}: ${this.formatEventDisplay(
          event.eventName,
          event.args,
          event.contractConfig,
        )}`,
      );

      await this.eventDispatcher.dispatchEvent(blockchainEvent);
    } catch (error) {
      this.logger.error(
        `❌ Error processing contract event for ${event.contractConfig.symbol}:`,
        error,
      );
    }
  }

  private getEventSignature(eventName: string): string {
    const knownSignatures: { [key: string]: string } = {
      Transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      Approval: '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
    };
    return knownSignatures[eventName] || '';
  }

  // Legacy methods removed - now using batch processing approach

  private decodeEventData(
    event: ethers.Log,
    contractConfig: ContractConfig,
    eventName: string,
  ): any[] {
    try {
      // Create interface for decoding
      const iface = new ethers.Interface(contractConfig.abi);
      const decoded = iface.parseLog({
        topics: event.topics,
        data: event.data,
      });

      return decoded ? Array.from(decoded.args) : [];
    } catch (error) {
      this.logger.warn(
        `⚠️ Failed to decode ${eventName} event for ${contractConfig.name}:`,
        error,
      );
      return [];
    }
  }

  private formatEventArgs(
    eventName: string,
    args: any[],
    config: ContractConfig,
  ): any {
    if (eventName === 'Transfer' && args.length >= 3) {
      return {
        from: args[0],
        to: args[1],
        value: args[2].toString(),
        valueFormatted: this.formatTokenValue(args[2].toString(), config),
        isLargeTransfer: this.isLargeTransfer(args[2].toString(), config),
      };
    }

    if (eventName === 'Approval' && args.length >= 3) {
      return {
        owner: args[0],
        spender: args[1],
        value: args[2].toString(),
        valueFormatted: this.formatTokenValue(args[2].toString(), config),
      };
    }

    // Default: return raw args
    return args.map((arg) =>
      typeof arg === 'object' && arg.toString ? arg.toString() : arg,
    );
  }

  private formatEventDisplay(
    eventName: string,
    args: any[],
    config: ContractConfig,
  ): string {
    if (eventName === 'Transfer' && args.length >= 3) {
      const formatted = this.formatTokenValue(args[2].toString(), config);
      return `${args[0]} -> ${args[1]} | ${formatted} ${config.symbol}`;
    }

    if (eventName === 'Approval' && args.length >= 3) {
      const formatted = this.formatTokenValue(args[2].toString(), config);
      return `${args[0]} approved ${args[1]} for ${formatted} ${config.symbol}`;
    }

    return `${eventName} with ${args.length} arguments`;
  }

  private formatTokenValue(value: string, config: ContractConfig): string {
    try {
      const decimals = config.metadata?.decimals || 18;
      const bigIntValue = BigInt(value);
      const divisor = BigInt(10 ** decimals);
      const formatted =
        Number((bigIntValue * BigInt(1000000)) / divisor) / 1000000;

      return formatted.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      });
    } catch {
      return value;
    }
  }

  private isLargeTransfer(value: string, config: ContractConfig): boolean {
    try {
      const decimals = config.metadata?.decimals || 18;
      const bigIntValue = BigInt(value);
      const divisor = BigInt(10 ** decimals);
      const tokenAmount = Number(bigIntValue) / Number(divisor);

      // Define large transfer thresholds based on token type
      if (config.metadata?.isStablecoin) {
        return tokenAmount >= 100_000; // 100k for stablecoins
      }

      return tokenAmount >= 1_000_000; // 1M for other tokens
    } catch {
      return false;
    }
  }

  getLastProcessedBlock(): number {
    return this.lastProcessedBlock;
  }

  setLastProcessedBlock(blockNumber: number): void {
    this.lastProcessedBlock = blockNumber;
    this.logger.log(
      `Set last processed block to ${blockNumber} for chain ${this.chainId}`,
    );
  }

  getScanInterval(): number {
    return this.scanIntervalMs;
  }

  getMonitoredContracts(): ContractConfig[] {
    return this.contractConfigs;
  }

  async refreshContracts(): Promise<void> {
    await this.loadContracts();
    this.logger.log(`Manually refreshed contracts for chain ${this.chainId}`);
  }
}
