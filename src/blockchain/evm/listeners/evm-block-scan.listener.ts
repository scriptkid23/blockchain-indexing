import { Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import {
  IBlockchainListener,
  BlockchainEvent,
} from '../../interfaces/blockchain.interface';
import { EventDispatcherService } from '../../core/event-dispatcher.service';
import { ContractConfigService } from '../../services/contract-config.service';
import { ConfigDataService } from '../../config-data/config-data.service';
import { ContractConfig } from '../../schemas/contract-config.schema';
import { CACHE_CONFIG } from '../utils/cache.config';
import { BLOCK_SCAN_CONFIG } from '../utils/block-scan.config';

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
  private scanIntervalMs: number;
  private readonly blocksPerScan: number;
  private contractConfigs: ContractConfig[] = [];
  private contractAddressesByAddress: Map<string, ContractConfig> = new Map();
  private eventsByTopic: Map<string, EventFragment> = new Map();
  private contractRefreshTimer: NodeJS.Timeout | null = null;
  private rpcRequestCount = 0;
  private lastCounterResetTime = Date.now();
  private receiptCache: Map<string, ethers.TransactionReceipt> = new Map();
  private blockCache: Map<number, ethers.Block> = new Map();
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(
    private readonly chainId: number,
    private readonly provider: ethers.Provider,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly contractConfigService: ContractConfigService,
    private readonly configDataService: ConfigDataService,
  ) {
    // scanIntervalMs will be initialized in start() method from configDataService
    this.scanIntervalMs = BLOCK_SCAN_CONFIG.scanIntervalMs;
    this.blocksPerScan = BLOCK_SCAN_CONFIG.blocksPerScan;
    this.maxRetries = BLOCK_SCAN_CONFIG.maxRetries;
    this.retryDelay = BLOCK_SCAN_CONFIG.retryDelay;
    this.logger.log(
      `Cache config initialized - Receipt: max=${CACHE_CONFIG.receipt.maxSize}, keep=${CACHE_CONFIG.receipt.keepSize} | Block: max=${CACHE_CONFIG.block.maxSize}, keep=${CACHE_CONFIG.block.keepSize}`,
    );
  }

  async start(): Promise<void> {
    if (this._isRunning) {
      this.logger.warn(
        `Dynamic block scan listener for chain ${this.chainId} is already running`,
      );
      return;
    }

    try {
      // Get scanInterval from chain config
      const chainConfig = this.configDataService.getChainConfig(this.chainId);
      if (chainConfig?.scanInterval) {
        this.scanIntervalMs = chainConfig.scanInterval;
      }

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
        await this.configDataService.getEnabledContractsByChain(this.chainId);

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
    // Refresh timer is now handled by ConfigDataService
    // This timer is kept for backward compatibility but calls the service's refresh
    // The actual refresh interval is controlled by CONTRACT_REFRESH_INTERVAL env var
    const refreshInterval = parseInt(
      process.env.CONTRACT_REFRESH_INTERVAL || '30000',
      10,
    );

    this.contractRefreshTimer = setInterval(async () => {
      if (!this.isRunning()) return;

      try {
        // Force refresh from ConfigDataService, then reload contracts
        await this.configDataService.forceRefresh();
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
    }, refreshInterval);
  }

  private async scanForNewBlocks(): Promise<void> {
    try {
      this.trackRpcRequest();
      const latestBlock = await this.retryRpcCall(
        () => this.provider.getBlockNumber(),
        'getBlockNumber',
      );

      if (!latestBlock) {
        this.logger.warn(
          `⚠️ Failed to get latest block number for chain ${this.chainId}`,
        );
        return;
      }

      if (this.contractConfigs.length === 0) {
        this.logger.debug('📭 No contracts to monitor, skipping block scan');
        return;
      }

      // Calculate effective start block for each contract
      // Use latestBlockScanned if > 0, otherwise use startBlock
      const contractStartBlocks = this.contractConfigs.map((config) => {
        const effectiveStart =
          this.contractConfigService.getEffectiveStartBlock(config);
        return {
          config,
          effectiveStart,
        };
      });

      // Find the minimum start block among all contracts
      const minStartBlock = Math.min(
        ...contractStartBlocks.map((c) => c.effectiveStart),
        this.lastProcessedBlock + 1,
      );

      if (latestBlock < minStartBlock) {
        this.logger.debug(
          `📊 No new blocks to process for chain ${this.chainId}. Latest: ${latestBlock}, Min start: ${minStartBlock}`,
        );
        return;
      }

      const startBlock = Math.max(minStartBlock, this.lastProcessedBlock + 1);
      const endBlock = Math.min(
        latestBlock,
        startBlock + this.blocksPerScan - 1,
      );

      // Validate block range: startBlock must be <= endBlock
      if (startBlock > endBlock) {
        this.logger.debug(
          `📊 No new blocks to scan for chain ${this.chainId}. Start: ${startBlock}, End: ${endBlock}, Latest: ${latestBlock}`,
        );
        return;
      }

      // Ensure we have at least 1 block to scan
      if (startBlock === endBlock && startBlock > latestBlock) {
        this.logger.debug(
          `📊 All blocks processed for chain ${this.chainId}. Latest: ${latestBlock}, Last processed: ${this.lastProcessedBlock}`,
        );
        return;
      }

      this.logger.log(
        `🔍 Scanning blocks ${startBlock} to ${endBlock} for chain ${this.chainId} (${endBlock - startBlock + 1} blocks)`,
      );

      // Use efficient batch processing for event extraction
      // Returns list of contracts that were actually scanned in this range
      const contractsScanned = await this.processBlockRangeWithBatching(
        startBlock,
        endBlock,
        contractStartBlocks,
      );

      this.lastProcessedBlock = endBlock;

      // Update latestBlockScanned only for contracts that were actually scanned
      if (contractsScanned && contractsScanned.length > 0) {
        await this.updateLatestBlockScannedForContracts(
          endBlock,
          contractsScanned,
        );
      }

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
    contractStartBlocks?: Array<{
      config: ContractConfig;
      effectiveStart: number;
    }>,
  ): Promise<ContractConfig[]> {
    try {
      if (this.contractConfigs.length === 0) {
        this.logger.debug(
          '📭 No contracts to monitor, skipping block range processing',
        );
        return [];
      }

      // Filter contracts that should be scanned in this range
      // Include contracts where effectiveStart <= toBlock
      // This ensures we scan contracts that have started by the end of this range
      let contractsToScan: ContractConfig[] = [];
      if (contractStartBlocks) {
        contractsToScan = contractStartBlocks
          .filter((c) => {
            // Contract should be scanned if effectiveStart <= toBlock
            // Even if effectiveStart > fromBlock, we still include it because
            // getLogs will only return events from the contract's effectiveStart onwards
            return c.effectiveStart <= toBlock;
          })
          .map((c) => c.config);
      } else {
        contractsToScan = this.contractConfigs;
      }

      if (contractsToScan.length === 0) {
        this.logger.debug(
          `📭 No contracts to scan in range ${fromBlock}-${toBlock} (all contracts start after ${toBlock} or after ${fromBlock})`,
        );
        return [];
      }

      // Get all events using optimized getLogs approach
      const allEvents = await this.getAllContractEventsInRange(
        fromBlock,
        toBlock,
        contractsToScan,
      );

      if (allEvents.length > 0) {
        // Group events by type for logging
        const eventTypes = allEvents.reduce(
          (acc, event) => {
            acc[event.eventName] = (acc[event.eventName] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

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

      // Return list of contracts that were actually scanned
      return contractsToScan;
    } catch (error) {
      this.logger.error(
        `❌ Error processing block range ${fromBlock}-${toBlock} on chain ${this.chainId}:`,
        error,
      );
      return [];
    }
  }

  private async getAllContractEventsInRange(
    fromBlock: number,
    toBlock: number,
    contractsToScan?: ContractConfig[],
  ): Promise<
    Array<{
      eventName: string;
      blockNumber: number;
      transactionHash: string;
      args: any[];
      timestamp: number;
      logIndex: number;
      transactionIndex: number;
      contractConfig: ContractConfig;
    }>
  > {
    try {
      // Validate block range
      if (fromBlock > toBlock) {
        this.logger.warn(
          `⚠️ Invalid block range: fromBlock (${fromBlock}) > toBlock (${toBlock}), skipping`,
        );
        return [];
      }

      // Build filter cho getLogs - query tất cả events cùng lúc
      // If contractsToScan is provided, only scan those contracts
      const contracts = contractsToScan || this.contractConfigs;
      const addresses = contracts.map((c) => c.address.toLowerCase());
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

  private async parseAndEnrichLogs(logs: ethers.Log[]): Promise<
    Array<{
      eventName: string;
      blockNumber: number;
      transactionHash: string;
      args: any[];
      timestamp: number;
      logIndex: number;
      transactionIndex: number;
      contractConfig: ContractConfig;
    }>
  > {
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

        // Convert args properly to preserve BigInt/BigNumber values as strings
        const args = parsed.args.map((arg: any) => {
          // Handle BigInt values (ethers v6)
          if (typeof arg === 'bigint') {
            return arg.toString();
          }
          // Handle BigNumber values (ethers v5 or wrapped)
          if (arg && typeof arg === 'object' && 'toString' in arg) {
            return arg.toString();
          }
          // Handle addresses and other strings
          if (typeof arg === 'string') {
            return arg;
          }
          // Fallback: convert to string
          return String(arg);
        });

        events.push({
          eventName: eventInfo.name,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          args: args,
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

    this.logger.debug(
      `📦 Fetching ${blocksToFetch.length} blocks for timestamps`,
    );

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

    // Cleanup block cache if exceeds max size
    if (this.blockCache.size > CACHE_CONFIG.block.maxSize) {
      const oldSize = this.blockCache.size;
      const entries = Array.from(this.blockCache.entries());
      const toKeep = entries.slice(-CACHE_CONFIG.block.keepSize);
      this.blockCache.clear();
      toKeep.forEach(([key, value]) => this.blockCache.set(key, value));
      this.logger.debug(
        `🧹 Block cache cleaned: ${oldSize} -> ${toKeep.length} entries kept`,
      );
    }
  }

  private async batchProcessEvents(
    events: Array<{
      eventName: string;
      blockNumber: number;
      transactionHash: string;
      args: any[];
      timestamp: number;
      logIndex: number;
      transactionIndex: number;
      contractConfig: ContractConfig;
    }>,
  ): Promise<void> {
    if (events.length === 0) return;

    // Collect unique transaction hashes
    const uniqueTxHashes = [...new Set(events.map((e) => e.transactionHash))];

    // Batch get receipts with caching - này sẽ populate receipt cache
    await this.batchGetReceipts(uniqueTxHashes);

    // Process events in batches and dispatch as batch
    const PROCESS_BATCH_SIZE = 100;
    for (let i = 0; i < events.length; i += PROCESS_BATCH_SIZE) {
      if (!this.isRunning()) break;

      const batch = events.slice(i, i + PROCESS_BATCH_SIZE);

      // Convert to BlockchainEvent objects
      const blockchainEvents: BlockchainEvent[] = [];
      for (const event of batch) {
        const blockchainEvent = await this.buildBlockchainEvent(event);
        if (blockchainEvent) {
          blockchainEvents.push(blockchainEvent);
        }
      }

      // Dispatch batch instead of individual events
      if (blockchainEvents.length > 0) {
        await this.eventDispatcher.dispatchBatch(blockchainEvents);
      }
    }
  }

  private async batchGetReceipts(txHashes: string[]): Promise<void> {
    // Filter receipts chưa có trong cache
    const receiptsToFetch = txHashes.filter(
      (hash) => !this.receiptCache.has(hash),
    );

    if (receiptsToFetch.length === 0) return;

    this.logger.debug(
      `📥 Fetching ${receiptsToFetch.length} transaction receipts`,
    );

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

    // Cleanup receipt cache if exceeds max size
    if (this.receiptCache.size > CACHE_CONFIG.receipt.maxSize) {
      const oldSize = this.receiptCache.size;
      const entries = Array.from(this.receiptCache.entries());
      const toKeep = entries.slice(-CACHE_CONFIG.receipt.keepSize);
      this.receiptCache.clear();
      toKeep.forEach(([key, value]) => this.receiptCache.set(key, value));
      this.logger.debug(
        `🧹 Receipt cache cleaned: ${oldSize} -> ${toKeep.length} entries kept`,
      );
    }
  }

  private async buildBlockchainEvent(event: {
    eventName: string;
    blockNumber: number;
    transactionHash: string;
    args: any[];
    timestamp: number;
    logIndex: number;
    transactionIndex: number;
    contractConfig: ContractConfig;
  }): Promise<BlockchainEvent | null> {
    try {
      const receipt = this.receiptCache.get(event.transactionHash);

      if (!receipt) {
        this.logger.warn(
          `⚠️ Receipt not in cache for ${event.transactionHash}, skipping event`,
        );
        return null;
      }

      // Create blockchain event
      const blockchainEvent: BlockchainEvent = {
        chainId: this.chainId,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        eventType: 'contract_log',
        contractAddress: event.contractConfig.address,
        data: {
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
            args: this.formatEventArgs(event.args),
          },
        },
        timestamp: event.timestamp,
      };

      return blockchainEvent;
    } catch (error) {
      this.logger.error(
        `❌ Error building blockchain event for ${event.contractConfig.symbol}:`,
        error,
      );
      return null;
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

  private formatEventArgs(args: any[]): any {
    return args.map((arg) =>
      typeof arg === 'object' && arg.toString ? arg.toString() : arg,
    );
  }

  // Update latestBlockScanned for contracts that were actually scanned
  private async updateLatestBlockScannedForContracts(
    endBlock: number,
    contractsScanned: ContractConfig[],
  ): Promise<void> {
    try {
      // Update latestBlockScanned only for contracts that were actually scanned
      const updatePromises = contractsScanned.map((config) =>
        this.contractConfigService.updateLatestBlockScanned(
          config.address,
          config.chainId,
          endBlock,
        ),
      );

      await Promise.all(updatePromises);
      this.logger.debug(
        `✅ Updated latestBlockScanned to ${endBlock} for ${updatePromises.length} contracts: ${contractsScanned.map((c) => c.symbol).join(', ')}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error updating latestBlockScanned for contracts:`,
        error,
      );
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
