import { Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { 
  IBlockchainListener, 
  BlockchainEvent, 
  ChainConfig 
} from '../../interfaces/blockchain.interface';
import { EventDispatcherService } from '../../core/event-dispatcher.service';

export class EvmBlockScanListener implements IBlockchainListener {
  private readonly logger = new Logger(EvmBlockScanListener.name);
  private _isRunning = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private lastProcessedBlock = 0;
  private readonly scanIntervalMs: number;
  private readonly blocksPerScan = 10; // Process up to 10 blocks per scan

  constructor(
    private readonly chainId: number,
    private readonly provider: ethers.JsonRpcProvider,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly config: ChainConfig,
  ) {
    this.scanIntervalMs = config.scanInterval || 5000; // Default 5 seconds
  }

  async start(): Promise<void> {
    if (this._isRunning) {
      this.logger.warn(`Block scan listener for chain ${this.chainId} is already running`);
      return;
    }

    try {
      // Initialize starting block
      if (this.lastProcessedBlock === 0) {
        this.lastProcessedBlock = await this.provider.getBlockNumber();
        this.logger.log(`Starting block scan from block ${this.lastProcessedBlock} for chain ${this.chainId}`);
      }

      this._isRunning = true;
      this.startScanning();
      this.logger.log(`Started block scan listener for chain ${this.chainId} (interval: ${this.scanIntervalMs}ms)`);
    } catch (error) {
      this.logger.error(`Failed to start block scan listener for chain ${this.chainId}:`, error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this._isRunning) {
      this.logger.warn(`Block scan listener for chain ${this.chainId} is not running`);
      return;
    }

    this._isRunning = false;
    
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    this.logger.log(`Stopped block scan listener for chain ${this.chainId}`);
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  private startScanning(): void {
    this.scanInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.scanForNewBlocks();
      } catch (error) {
        this.logger.error(`Error during block scan for chain ${this.chainId}:`, error);
      }
    }, this.scanIntervalMs);
  }

  private async scanForNewBlocks(): Promise<void> {
    try {
      const latestBlock = await this.provider.getBlockNumber();
      
      if (latestBlock <= this.lastProcessedBlock) {
        this.logger.debug(`No new blocks to process for chain ${this.chainId}. Latest: ${latestBlock}, Last processed: ${this.lastProcessedBlock}`);
        return;
      }

      const startBlock = this.lastProcessedBlock + 1;
      const endBlock = Math.min(latestBlock, startBlock + this.blocksPerScan - 1);

      this.logger.debug(`Scanning blocks ${startBlock} to ${endBlock} for chain ${this.chainId}`);

      // Process blocks sequentially to maintain order
      for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
        if (!this.isRunning) break; // Stop if listener was stopped during processing
        
        await this.processBlock(blockNumber);
        this.lastProcessedBlock = blockNumber;
      }

      if (endBlock < latestBlock) {
        this.logger.debug(`More blocks to process for chain ${this.chainId}. Will continue in next scan.`);
      }
    } catch (error) {
      this.logger.error(`Error scanning for new blocks on chain ${this.chainId}:`, error);
    }
  }

  private async processBlock(blockNumber: number): Promise<void> {
    try {
      const block = await this.provider.getBlock(blockNumber, true);
      if (!block) {
        this.logger.warn(`Block ${blockNumber} not found on chain ${this.chainId}`);
        return;
      }

      this.logger.debug(`Processing block ${blockNumber} with ${block.transactions.length} transactions on chain ${this.chainId}`);

      // Process each transaction in the block
      for (const tx of block.transactions) {
        if (!this.isRunning) break;
        if (typeof tx === 'string') continue; // Skip if transaction is just a hash
        
        await this.processTransaction(tx as ethers.TransactionResponse, block);
      }
    } catch (error) {
      this.logger.error(`Error processing block ${blockNumber} on chain ${this.chainId}:`, error);
    }
  }

  private async processTransaction(
    tx: ethers.TransactionResponse, 
    block: ethers.Block
  ): Promise<void> {
    try {
      // Get transaction receipt for logs
      const receipt = await this.provider.getTransactionReceipt(tx.hash);
      if (!receipt) {
        this.logger.warn(`Transaction receipt not found for ${tx.hash} on chain ${this.chainId}`);
        return;
      }

      // Process contract interaction transactions
      if (tx.to && receipt.logs.length > 0) {
        for (const log of receipt.logs) {
          const event: BlockchainEvent = {
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
            },
            timestamp: block.timestamp * 1000, // Convert to milliseconds
          };

          await this.eventDispatcher.dispatchEvent(event);
        }
      }

      // Create a general transaction event
      const txEvent: BlockchainEvent = {
        chainId: this.chainId,
        blockNumber: block.number,
        transactionHash: tx.hash,
        eventType: 'transaction',
        contractAddress: tx.to || '',
        data: {
          from: tx.from,
          to: tx.to,
          value: tx.value.toString(),
          gasPrice: tx.gasPrice?.toString(),
          gasLimit: tx.gasLimit.toString(),
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status,
          nonce: tx.nonce,
        },
        timestamp: block.timestamp * 1000,
      };

      await this.eventDispatcher.dispatchEvent(txEvent);
    } catch (error) {
      this.logger.error(`Error processing transaction ${tx.hash} on chain ${this.chainId}:`, error);
    }
  }

  getLastProcessedBlock(): number {
    return this.lastProcessedBlock;
  }

  setLastProcessedBlock(blockNumber: number): void {
    this.lastProcessedBlock = blockNumber;
    this.logger.log(`Set last processed block to ${blockNumber} for chain ${this.chainId}`);
  }

  getScanInterval(): number {
    return this.scanIntervalMs;
  }
} 