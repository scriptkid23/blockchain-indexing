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
  private readonly blocksPerScan = 10;
  private contractConfigs: ContractConfig[] = [];
  private contractAddresses: Set<string> = new Set();
  private eventSignatures: Set<string> = new Set();
  private contractRefreshTimer: NodeJS.Timeout | null = null;
  private readonly contractRefreshInterval = 30000; // 30 seconds

  constructor(
    private readonly chainId: number,
    private readonly provider: ethers.JsonRpcProvider,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly config: ChainConfig,
    private readonly contractConfigService: ContractConfigService,
  ) {
    this.scanIntervalMs = config.scanInterval || 5000; // Default 5 seconds
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
      const latestBlock = await this.provider.getBlockNumber();

      if (latestBlock <= this.lastProcessedBlock) {
        this.logger.debug(
          `No new blocks to process for chain ${this.chainId}. Latest: ${latestBlock}, Last processed: ${this.lastProcessedBlock}`,
        );
        return;
      }

      const startBlock = this.lastProcessedBlock + 1;
      const endBlock = Math.min(
        latestBlock,
        startBlock + this.blocksPerScan - 1,
      );

      this.logger.debug(
        `Scanning blocks ${startBlock} to ${endBlock} for chain ${this.chainId}`,
      );

      // Process blocks sequentially to maintain order
      for (
        let blockNumber = startBlock;
        blockNumber <= endBlock;
        blockNumber++
      ) {
        if (!this.isRunning()) break;

        await this.processBlock(blockNumber);
        this.lastProcessedBlock = blockNumber;
      }

      if (endBlock < latestBlock) {
        this.logger.debug(
          `More blocks to process for chain ${this.chainId}. Will continue in next scan.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error scanning for new blocks on chain ${this.chainId}:`,
        error,
      );
    }
  }

  private async processBlock(blockNumber: number): Promise<void> {
    try {
      const block = await this.provider.getBlock(blockNumber, true);
      if (!block) {
        this.logger.warn(
          `Block ${blockNumber} not found on chain ${this.chainId}`,
        );
        return;
      }

      this.logger.debug(
        `Processing block ${blockNumber} with ${block.transactions.length} transactions on chain ${this.chainId}`,
      );

      // Process each transaction in the block
      for (const tx of block.transactions) {
        if (!this.isRunning()) break;
        if (typeof tx === 'string') continue;

        await this.processTransaction(tx as ethers.TransactionResponse, block);
      }
    } catch (error) {
      this.logger.error(
        `Error processing block ${blockNumber} on chain ${this.chainId}:`,
        error,
      );
    }
  }

  private async processTransaction(
    tx: ethers.TransactionResponse,
    block: ethers.Block,
  ): Promise<void> {
    try {
      // Get transaction receipt for logs
      const receipt = await this.provider.getTransactionReceipt(tx.hash);
      if (!receipt) {
        this.logger.warn(
          `Transaction receipt not found for ${tx.hash} on chain ${this.chainId}`,
        );
        return;
      }

      // Only process transactions with logs from monitored contracts
      if (!tx.to || receipt.logs.length === 0) return;

      let hasMonitoredEvents = false;

      // Process contract logs
      for (const log of receipt.logs) {
        if (!this.isMonitoredContract(log.address)) continue;
        if (!this.isMonitoredEvent(log.topics[0])) continue;

        hasMonitoredEvents = true;
        await this.processContractLog(log, tx, block, receipt);
      }

      // Log transaction summary if it contained monitored events
      if (hasMonitoredEvents) {
        this.logger.debug(
          `Processed transaction ${tx.hash} with monitored contract events`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error processing transaction ${tx.hash} on chain ${this.chainId}:`,
        error,
      );
    }
  }

  private async processContractLog(
    log: ethers.Log,
    tx: ethers.TransactionResponse,
    block: ethers.Block,
    receipt: ethers.TransactionReceipt,
  ): Promise<void> {
    try {
      const contractConfig = this.getContractConfig(log.address);
      if (!contractConfig) return;

      // Get event name from signature
      const eventName = this.parseEventName(log.topics[0]);
      if (!eventName) return;

      // Decode event data
      const eventArgs = this.decodeEventData(log, contractConfig, eventName);

      // Create blockchain event
      const blockchainEvent: BlockchainEvent = {
        chainId: this.chainId,
        blockNumber: block.number,
        transactionHash: tx.hash,
        eventType: 'contract_log',
        contractAddress: log.address,
        data: {
          topics: log.topics,
          data: log.data,
          logIndex: log.index,
          transactionIndex: log.transactionIndex,
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status,
          contract: {
            name: contractConfig.name,
            symbol: contractConfig.symbol,
            type: contractConfig.type,
          },
          event: {
            name: eventName,
            signature: log.topics[0],
            args: this.formatEventArgs(eventName, eventArgs, contractConfig),
          },
        },
        timestamp: block.timestamp * 1000,
      };

      this.logger.log(
        `${contractConfig.symbol} ${eventName}: ${this.formatEventDisplay(eventName, eventArgs, contractConfig)}`,
      );

      await this.eventDispatcher.dispatchEvent(blockchainEvent);
    } catch (error) {
      this.logger.error(
        `Error processing contract log for ${log.address}:`,
        error,
      );
    }
  }

  private isMonitoredContract(address: string): boolean {
    return this.contractAddresses.has(address.toLowerCase());
  }

  private isMonitoredEvent(eventSignature: string): boolean {
    return this.eventSignatures.has(eventSignature);
  }

  private getContractConfig(address: string): ContractConfig | null {
    return (
      this.contractConfigs.find(
        (config) => config.address.toLowerCase() === address.toLowerCase(),
      ) || null
    );
  }

  private parseEventName(eventSignature: string): string | null {
    const knownEvents: { [key: string]: string } = {
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef':
        'Transfer',
      '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925':
        'Approval',
    };

    return knownEvents[eventSignature] || null;
  }

  private decodeEventData(
    log: ethers.Log,
    contractConfig: ContractConfig,
    eventName: string,
  ): any[] {
    try {
      // Create interface for decoding
      const iface = new ethers.Interface(contractConfig.abi);
      const decoded = iface.parseLog({
        topics: log.topics,
        data: log.data,
      });

      return decoded ? decoded.args : [];
    } catch (error) {
      this.logger.warn(
        `Failed to decode ${eventName} event for ${contractConfig.name}:`,
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
