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

interface EventFragment {
  name: string;
  signature: string;
  topic: string;
}

export class EvmBlockScanListener implements IBlockchainListener {
  private readonly logger = new Logger(EvmBlockScanListener.name);
  private _isRunning = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private lastProcessedBlock = 0;
  private readonly scanIntervalMs: number;
  private readonly blocksPerScan: number;
  private contractConfigs: ContractConfig[] = [];
  private contractAddressesByAddress: Map<string, ContractConfig> = new Map();
  private eventsByTopic: Map<string, EventFragment> = new Map();
  private contractRefreshTimer: NodeJS.Timeout | null = null;
  private readonly contractRefreshInterval = 600000; // 10 minutes - increased from 5 minutes
  private rpcRequestCount = 0;
  private lastCounterResetTime = Date.now();
  private receiptCache: Map<string, ethers.TransactionReceipt> = new Map();
  private blockCache: Map<number, ethers.Block> = new Map();
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor(
    private readonly chainId: number,
    private readonly provider: ethers.JsonRpcProvider,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly config: ChainConfig,
    private readonly contractConfigService: ContractConfigService,
  ) {
    this.scanIntervalMs = config.scanInterval || 5000; // Default 5 seconds
    this.blocksPerScan = parseInt(process.env.BLOCKS_PER_SCAN || '100', 10); // Tăng từ 50 lên 100 blocks per scan
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

  private async retryRpcCall<T>(
    fn: () => Promise<T>,
    context: string,
  ): Promise<T | null> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === this.maxRetries) {
          this.logger.error(
            `❌ RPC call failed after ${this.maxRetries} attempts (${context}):`,
            error,
          );
          return null;
        }
        this.logger.warn(
          `⚠️ RPC call failed (${context}), attempt ${attempt}/${this.maxRetries}, retrying...`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelay * attempt),
        );
      }
    }
    return null;
  }

  private async loadContracts(): Promise<void> {
    try {
      this.contractConfigs =
        await this.contractConfigService.getEnabledContractsByChain(
          this.chainId,
        );

      // Clear caches khi reload contracts
      this.contractAddressesByAddress.clear();
      this.eventsByTopic.clear();
      this.receiptCache.clear();
      this.blockCache.clear();

      // Build maps cho fast lookup
      for (const config of this.contractConfigs) {
        const address = config.address.toLowerCase();
        this.contractAddressesByAddress.set(address, config);

        // Parse events từ ABI thay vì dùng hardcoded signatures
        this.parseEventsFromABI(config);
      }

      this.logger.log(
        `Loaded ${this.contractConfigs.length} contracts, ${this.eventsByTopic.size} unique events for chain ${this.chainId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error loading contracts for chain ${this.chainId}:`,
        error,
      );
      throw error;
    }
  }

  private parseEventsFromABI(config: ContractConfig): void {
    try {
      const iface = new ethers.Interface(config.abi);
      
      // Parse tất cả events từ ABI
      iface.forEachEvent((eventFragment) => {
        const topic = eventFragment.topicHash;
        
        // Chỉ thêm nếu event này được enable trong config
        if (config.events.includes(topic)) {
          this.eventsByTopic.set(topic, {
            name: eventFragment.name,
            signature: eventFragment.format('sighash'),
            topic: topic,
          });
        }
      });
    } catch (error) {
      this.logger.warn(
        `Failed to parse events from ABI for ${config.symbol}:`,
        error,
      );
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
      const latestBlock = await this.retryRpcCall(
        () => this.provider.getBlockNumber(),
        'getBlockNumber',
      );

      if (!latestBlock || latestBlock <= this.lastProcessedBlock) {
        if (!latestBlock) {
          this.logger.warn(`⚠️ Failed to get latest block number for chain ${this.chainId}`);
        } else {
          this.logger.debug(
            `📊 No new blocks to process for chain ${this.chainId}. Latest: ${latestBlock}, Last processed: ${this.lastProcessedBlock}`,
          );
        }
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

      // Get all events using optimized getLogs approach
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

        // Batch process events thay vì từng cái một
        await this.batchProcessEvents(allEvents);
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
    try {
      // Build filter cho getLogs - query tất cả events cùng lúc
      const addresses = Array.from(this.contractAddressesByAddress.keys());
      const topics = Array.from(this.eventsByTopic.keys());

      if (addresses.length === 0 || topics.length === 0) {
        return [];
      }

      // Single RPC call thay vì N * M calls - với retry logic
      this.trackRpcRequest();
      const logs = await this.retryRpcCall(
        () =>
          this.provider.getLogs({
            address: addresses,
            topics: [topics], // topics[0] = event signature
            fromBlock,
            toBlock,
          }),
        `getLogs(${fromBlock}-${toBlock})`,
      );

      if (!logs) {
        this.logger.warn(
          `⚠️ Failed to get logs for blocks ${fromBlock}-${toBlock}`,
        );
        return [];
      }

      this.logger.debug(
        `📥 Retrieved ${logs.length} raw logs from RPC for blocks ${fromBlock}-${toBlock}`,
      );

      // Parse và enrich logs
      const parsedEvents = await this.parseAndEnrichLogs(logs);

      // Sort by block number and log index
      parsedEvents.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
          return a.blockNumber - b.blockNumber;
        }
        return a.logIndex - b.logIndex;
      });

      return parsedEvents;
    } catch (error) {
      this.logger.error(
        `❌ Error getting logs for blocks ${fromBlock}-${toBlock}:`,
        error,
      );
      return [];
    }
  }

  private async parseAndEnrichLogs(logs: ethers.Log[]): Promise<Array<{
    eventName: string;
    blockNumber: number;
    transactionHash: string;
    args: any[];
    timestamp: number;
    logIndex: number;
    transactionIndex: number;
    contractConfig: ContractConfig;
  }>> {
    const events: any[] = [];

    // Collect unique block numbers để fetch timestamps
    const uniqueBlocks = new Set<number>();
    logs.forEach((log) => uniqueBlocks.add(log.blockNumber));

    // Batch get block timestamps with caching
    await this.batchGetBlocks(Array.from(uniqueBlocks));

    // Parse từng log
    for (const log of logs) {
      try {
        const address = log.address.toLowerCase();
        const topic = log.topics[0];

        const contractConfig = this.contractAddressesByAddress.get(address);
        const eventInfo = this.eventsByTopic.get(topic);

        if (!contractConfig || !eventInfo) {
          continue;
        }

        // Decode event args
        const iface = new ethers.Interface(contractConfig.abi);
        const parsed = iface.parseLog({
          topics: log.topics,
          data: log.data,
        });

        if (!parsed) continue;

        const block = this.blockCache.get(log.blockNumber);
        const timestamp = block ? block.timestamp * 1000 : 0;

        events.push({
          eventName: eventInfo.name,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          args: Array.from(parsed.args),
          timestamp,
          logIndex: log.index,
          transactionIndex: log.transactionIndex,
          contractConfig,
        });
      } catch (error) {
        this.logger.warn(
          `⚠️ Failed to parse log at block ${log.blockNumber}:`,
          error,
        );
      }
    }

    return events;
  }

  private async batchGetBlocks(blockNumbers: number[]): Promise<void> {
    // Filter ra những blocks chưa có trong cache
    const blocksToFetch = blockNumbers.filter(
      (num) => !this.blockCache.has(num),
    );

    if (blocksToFetch.length === 0) return;

    this.logger.debug(`📦 Fetching ${blocksToFetch.length} blocks for timestamps`);

    // Tăng batch size từ 10 lên 20 để giảm số lần await
    const BLOCK_BATCH_SIZE = 20;
    for (let i = 0; i < blocksToFetch.length; i += BLOCK_BATCH_SIZE) {
      const batch = blocksToFetch.slice(i, i + BLOCK_BATCH_SIZE);
      
      const blockPromises = batch.map(async (blockNumber) => {
        this.trackRpcRequest();
        const block = await this.retryRpcCall(
          () => this.provider.getBlock(blockNumber),
          `getBlock(${blockNumber})`,
        );
        if (block) {
          this.blockCache.set(blockNumber, block);
        }
      });

      await Promise.all(blockPromises);
    }

    // Tăng cache size từ 1000 lên 2000 để giảm cache eviction
    if (this.blockCache.size > 2000) {
      const entries = Array.from(this.blockCache.entries());
      const toKeep = entries.slice(-1000); // Keep latest 1000
      this.blockCache.clear();
      toKeep.forEach(([key, value]) => this.blockCache.set(key, value));
    }
  }

  private async batchProcessEvents(events: Array<{
    eventName: string;
    blockNumber: number;
    transactionHash: string;
    args: any[];
    timestamp: number;
    logIndex: number;
    transactionIndex: number;
    contractConfig: ContractConfig;
  }>): Promise<void> {
    if (events.length === 0) return;

    // Collect unique transaction hashes
    const uniqueTxHashes = [...new Set(events.map((e) => e.transactionHash))];

    // Batch get receipts with caching - này sẽ populate receipt cache
    await this.batchGetReceipts(uniqueTxHashes);

    // Process events with cached receipts - tăng batch size từ 50 lên 100
    const PROCESS_BATCH_SIZE = 100;
    for (let i = 0; i < events.length; i += PROCESS_BATCH_SIZE) {
      if (!this.isRunning()) break;
      
      const batch = events.slice(i, i + PROCESS_BATCH_SIZE);
      const processPromises = batch.map((event) => this.processContractEvent(event));
      
      await Promise.all(processPromises);
    }
  }

  private async batchGetReceipts(txHashes: string[]): Promise<void> {
    // Filter receipts chưa có trong cache
    const receiptsToFetch = txHashes.filter(
      (hash) => !this.receiptCache.has(hash),
    );

    if (receiptsToFetch.length === 0) return;

    this.logger.debug(`📥 Fetching ${receiptsToFetch.length} transaction receipts`);

    // Tăng batch size từ 20 lên 30 để parallel requests tốt hơn
    const RECEIPT_BATCH_SIZE = 30;
    for (let i = 0; i < receiptsToFetch.length; i += RECEIPT_BATCH_SIZE) {
      const batch = receiptsToFetch.slice(i, i + RECEIPT_BATCH_SIZE);
      
      const receiptPromises = batch.map(async (txHash) => {
        this.trackRpcRequest();
        const receipt = await this.retryRpcCall(
          () => this.provider.getTransactionReceipt(txHash),
          `getReceipt(${txHash.substring(0, 10)}...)`,
        );
        if (receipt !== null) {
          this.receiptCache.set(txHash, receipt);
        }
      });

      await Promise.all(receiptPromises);
    }

    // Tăng cache size từ 2000 lên 3000
    if (this.receiptCache.size > 3000) {
      const entries = Array.from(this.receiptCache.entries());
      const toKeep = entries.slice(-1500); // Keep latest 1500
      this.receiptCache.clear();
      toKeep.forEach(([key, value]) => this.receiptCache.set(key, value));
    }
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
      // Get cached receipt (đã fetch trước đó trong batch)
      const receipt = this.receiptCache.get(event.transactionHash);

      if (!receipt) {
        // Không fallback fetch nữa - log warning và skip
        // Receipt đáng lẽ đã được fetch trong batch
        this.logger.warn(
          `⚠️ Receipt not in cache for ${event.transactionHash}, skipping event`,
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
            signature: this.getEventSignatureFromConfig(
              event.eventName,
              event.contractConfig,
            ),
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

  private getEventSignatureFromConfig(
    eventName: string,
    config: ContractConfig,
  ): string {
    try {
      const iface = new ethers.Interface(config.abi);
      const eventFragment = iface.getEvent(eventName);
      return eventFragment ? eventFragment.topicHash : '';
    } catch {
      return '';
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
