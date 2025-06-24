import { Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { 
  IBlockchainListener, 
  BlockchainEvent, 
  ChainConfig 
} from '../../interfaces/blockchain.interface';
import { EventDispatcherService } from '../../core/event-dispatcher.service';

export class EvmWebSocketListener implements IBlockchainListener {
  private readonly logger = new Logger(EvmWebSocketListener.name);
  private _isRunning = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly chainId: number,
    private readonly wsProvider: ethers.WebSocketProvider,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly config: ChainConfig,
  ) {}

  async start(): Promise<void> {
    if (this._isRunning) {
      this.logger.warn(`WebSocket listener for chain ${this.chainId} is already running`);
      return;
    }

    try {
      await this.setupEventListeners();
      this._isRunning = true;
      this.reconnectAttempts = 0;
      this.logger.log(`Started WebSocket listener for chain ${this.chainId}`);
    } catch (error) {
      this.logger.error(`Failed to start WebSocket listener for chain ${this.chainId}:`, error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this._isRunning) {
      this.logger.warn(`WebSocket listener for chain ${this.chainId} is not running`);
      return;
    }

    this._isRunning = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      this.removeAllListeners();
      this.logger.log(`Stopped WebSocket listener for chain ${this.chainId}`);
    } catch (error) {
      this.logger.error(`Error stopping WebSocket listener for chain ${this.chainId}:`, error);
    }
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  private async setupEventListeners(): Promise<void> {
    // Listen for new blocks
    this.wsProvider.on('block', async (blockNumber: number) => {
      if (!this.isRunning) return;
      
      try {
        this.logger.debug(`New block ${blockNumber} on chain ${this.chainId}`);
        await this.processBlock(blockNumber);
      } catch (error) {
        this.logger.error(`Error processing block ${blockNumber} on chain ${this.chainId}:`, error);
      }
    });

    // Listen for pending transactions (optional, can be resource intensive)
    // this.wsProvider.on('pending', (txHash: string) => {
    //   this.logger.debug(`New pending transaction: ${txHash}`);
    // });

    // Handle WebSocket errors
    this.wsProvider.on('error', (error: Error) => {
      this.logger.error(`WebSocket error on chain ${this.chainId}:`, error);
      this.handleConnectionError();
    });

    // WebSocket disconnection is handled through the error event above

    this.logger.log(`Event listeners set up for chain ${this.chainId}`);
  }

  private async processBlock(blockNumber: number): Promise<void> {
    try {
      const block = await this.wsProvider.getBlock(blockNumber, true);
      if (!block) {
        this.logger.warn(`Block ${blockNumber} not found on chain ${this.chainId}`);
        return;
      }

      // Process each transaction in the block
      for (const tx of block.transactions) {
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
      const receipt = await this.wsProvider.getTransactionReceipt(tx.hash);
      if (!receipt) return;

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
      this.logger.error(`Error processing transaction ${tx.hash}:`, error);
    }
  }

  private handleConnectionError(): void {
    if (!this.isRunning) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(`Max reconnection attempts reached for chain ${this.chainId}. Stopping listener.`);
      this.stop();
      return;
    }

    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
    this.reconnectAttempts++;

    this.logger.warn(`Attempting to reconnect WebSocket for chain ${this.chainId} in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.reconnect();
      } catch (error) {
        this.logger.error(`Reconnection failed for chain ${this.chainId}:`, error);
        this.handleConnectionError();
      }
    }, delay);
  }

  private async reconnect(): Promise<void> {
    this.removeAllListeners();
    await this.setupEventListeners();
    this.logger.log(`Successfully reconnected WebSocket for chain ${this.chainId}`);
    this.reconnectAttempts = 0;
  }

  private removeAllListeners(): void {
    this.wsProvider.removeAllListeners();
  }
} 