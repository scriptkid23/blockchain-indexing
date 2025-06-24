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

interface ContractInstance {
  config: ContractConfig;
  contract: ethers.Contract;
}

export class EvmWebSocketListener implements IBlockchainListener {
  private readonly logger = new Logger(EvmWebSocketListener.name);
  private _isRunning = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private contractInstances: Map<string, ContractInstance> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;
  private readonly contractRefreshInterval = 30000; // 30 seconds

  constructor(
    private readonly chainId: number,
    private readonly wsProvider: ethers.WebSocketProvider,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly config: ChainConfig,
    private readonly contractConfigService: ContractConfigService,
  ) {}

  async start(): Promise<void> {
    if (this._isRunning) {
      this.logger.warn(
        `Dynamic contract listener for chain ${this.chainId} is already running`,
      );
      return;
    }

    try {
      await this.loadAndSetupContracts();
      this.startContractRefreshTimer();
      this._isRunning = true;
      this.reconnectAttempts = 0;
      this.logger.log(
        `Started dynamic contract listener for chain ${this.chainId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start dynamic contract listener for chain ${this.chainId}:`,
        error,
      );
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this._isRunning) {
      this.logger.warn(
        `Dynamic contract listener for chain ${this.chainId} is not running`,
      );
      return;
    }

    this._isRunning = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    try {
      this.removeAllListeners();
      this.logger.log(
        `Stopped dynamic contract listener for chain ${this.chainId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error stopping dynamic contract listener for chain ${this.chainId}:`,
        error,
      );
    }
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  private async loadAndSetupContracts(): Promise<void> {
    try {
      // Load enabled contracts for this chain from MongoDB
      const contractConfigs =
        await this.contractConfigService.getEnabledContractsByChain(
          this.chainId,
        );

      this.logger.log(
        `Loading ${contractConfigs.length} contracts for chain ${this.chainId}`,
      );

      // Clear existing contracts
      this.removeAllListeners();
      this.contractInstances.clear();

      // Setup each contract
      for (const contractConfig of contractConfigs) {
        await this.setupContract(contractConfig);
      }

      // Setup WebSocket error handling
      this.wsProvider.on('error', (error: Error) => {
        this.logger.error(`WebSocket error on chain ${this.chainId}:`, error);
        this.handleConnectionError();
      });

      this.logger.log(
        `Dynamic contract listener set up for chain ${this.chainId} with ${this.contractInstances.size} contracts`,
      );
    } catch (error) {
      this.logger.error(
        `Error loading contracts for chain ${this.chainId}:`,
        error,
      );
      throw error;
    }
  }

  private async setupContract(contractConfig: ContractConfig): Promise<void> {
    try {
      // Create contract instance
      const contract = new ethers.Contract(
        contractConfig.address,
        contractConfig.abi,
        this.wsProvider,
      );

      // Store contract instance
      const contractInstance: ContractInstance = {
        config: contractConfig,
        contract,
      };

      this.contractInstances.set(
        contractConfig.address.toLowerCase(),
        contractInstance,
      );

      // Setup event listeners for each configured event
      for (const eventSignature of contractConfig.events) {
        this.setupEventListener(contractInstance, eventSignature);
      }

      this.logger.log(
        `Setup contract: ${contractConfig.name} (${contractConfig.symbol}) - ${contractConfig.events.length} events`,
      );
    } catch (error) {
      this.logger.error(
        `Error setting up contract ${contractConfig.name}:`,
        error,
      );
    }
  }

  private setupEventListener(
    contractInstance: ContractInstance,
    eventSignature: string,
  ): void {
    const { config, contract } = contractInstance;

    try {
      // Parse event signature to get event name
      const eventName = this.parseEventName(eventSignature);
      if (!eventName) return;

      // Set up event listener
      contract.on(eventName, async (...args) => {
        if (!this.isRunning()) return;

        try {
          const event = args[args.length - 1]; // Last argument is always the event object
          const eventArgs = args.slice(0, -1); // All arguments except the last one

          // Enhanced logging for debugging
          this.logger.debug(`Raw event structure for ${config.name}.${eventName}:`, {
            eventKeys: Object.keys(event || {}),
            hasTransactionHash: !!event?.transactionHash,
            hasBlockNumber: !!event?.blockNumber,
            hasLog: !!event?.log,
            eventType: typeof event,
          });

          await this.processContractEvent(
            contractInstance,
            eventName,
            eventArgs,
            event,
          );
        } catch (error) {
          this.logger.error(
            `Error processing ${eventName} event for ${config.name}:`,
            error,
          );
        }
      });

      this.logger.debug(`Setup event listener: ${config.name}.${eventName}`);
    } catch (error) {
      this.logger.error(
        `Error setting up event listener for ${config.name}, event: ${eventSignature}:`,
        error,
      );
    }
  }

  private async processContractEvent(
    contractInstance: ContractInstance,
    eventName: string,
    eventArgs: any[],
    event: any,
  ): Promise<void> {
    const { config } = contractInstance;

    try {
      // Extract event data - ethers.js events can have different structures
      let transactionHash: string;
      let blockNumber: number;
      let logIndex: number;
      let transactionIndex: number;
      let topics: string[];
      let data: string;

      // Handle different event structures from ethers.js
      if (event.log) {
        // Event has a log property (common in newer ethers versions)
        transactionHash = event.log.transactionHash;
        blockNumber = event.log.blockNumber;
        logIndex = event.log.logIndex;
        transactionIndex = event.log.transactionIndex;
        topics = event.log.topics;
        data = event.log.data;
      } else if (event.transactionHash && event.blockNumber) {
        // Direct properties on event object
        transactionHash = event.transactionHash;
        blockNumber = event.blockNumber;
        logIndex = event.logIndex;
        transactionIndex = event.transactionIndex;
        topics = event.topics;
        data = event.data;
      } else {
        this.logger.warn(`Invalid event data structure for ${config.name}:`, {
          eventKeys: Object.keys(event || {}),
          hasLog: !!event?.log,
          hasTransactionHash: !!event?.transactionHash,
          hasBlockNumber: !!event?.blockNumber,
        });
        return;
      }

      // Validate required fields
      if (!transactionHash || !blockNumber) {
        this.logger.warn(`Missing required event data for ${config.name}: transactionHash=${!!transactionHash}, blockNumber=${!!blockNumber}`);
        return;
      }

      // Get transaction receipt and block details
      const [receipt, block] = await Promise.all([
        this.wsProvider.getTransactionReceipt(transactionHash),
        this.wsProvider.getBlock(blockNumber),
      ]);

      if (!receipt || !block) {
        this.logger.warn(`Failed to get receipt or block for ${config.name} tx: ${transactionHash}`);
        return;
      }

      // Create blockchain event
      const blockchainEvent: BlockchainEvent = {
        chainId: this.chainId,
        blockNumber: blockNumber,
        transactionHash: transactionHash,
        eventType: 'contract_log',
        contractAddress: config.address,
        data: {
          topics: topics || [],
          data: data || '0x',
          logIndex: logIndex,
          transactionIndex: transactionIndex,
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status,
          contract: {
            name: config.name,
            symbol: config.symbol,
            type: config.type,
          },
          event: {
            name: eventName,
            signature: this.getEventSignature(eventName, config.events),
            args: this.formatEventArgs(eventName, eventArgs, config),
          },
        },
        timestamp: block.timestamp * 1000,
      };

      this.logger.log(
        `${config.symbol} ${eventName}: ${this.formatEventDisplay(eventName, eventArgs, config)}`,
      );

      await this.eventDispatcher.dispatchEvent(blockchainEvent);
    } catch (error) {
      this.logger.error(
        `Error processing ${eventName} event for ${config.name}:`,
        error,
      );
    }
  }

  private parseEventName(eventSignature: string): string | null {
    // Extract event name from signature hash (we need to match it with ABI)
    // For now, we'll use known common events
    const knownEvents: { [key: string]: string } = {
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef':
        'Transfer',
      '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925':
        'Approval',
    };

    return knownEvents[eventSignature] || null;
  }

  private getEventSignature(
    eventName: string,
    eventSignatures: string[],
  ): string | undefined {
    const knownEvents: { [key: string]: string } = {
      Transfer:
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
      Approval:
        '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
    };

    return knownEvents[eventName];
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

  private startContractRefreshTimer(): void {
    this.refreshTimer = setInterval(async () => {
      if (!this.isRunning()) return;

      try {
        await this.loadAndSetupContracts();
        this.logger.debug(`Refreshed contracts for chain ${this.chainId}`);
      } catch (error) {
        this.logger.error(
          `Error refreshing contracts for chain ${this.chainId}:`,
          error,
        );
      }
    }, this.contractRefreshInterval);
  }

  private handleConnectionError(): void {
    if (!this.isRunning()) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        `Max reconnection attempts reached for chain ${this.chainId}. Stopping listener.`,
      );
      void this.stop();
      return;
    }

    const delay = Math.pow(2, this.reconnectAttempts) * 1000;
    this.reconnectAttempts++;

    this.logger.warn(
      `Attempting to reconnect WebSocket for chain ${this.chainId} in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.reconnect();
      } catch (error) {
        this.logger.error(
          `Reconnection failed for chain ${this.chainId}:`,
          error,
        );
        this.handleConnectionError();
      }
    }, delay);
  }

  private async reconnect(): Promise<void> {
    this.removeAllListeners();
    await this.loadAndSetupContracts();
    this.logger.log(
      `Successfully reconnected WebSocket for chain ${this.chainId}`,
    );
    this.reconnectAttempts = 0;
  }

  private removeAllListeners(): void {
    // Remove contract listeners
    for (const contractInstance of this.contractInstances.values()) {
      try {
        contractInstance.contract.removeAllListeners();
      } catch (error) {
        this.logger.warn(
          `Error removing listeners for contract ${contractInstance.config.name}:`,
          error,
        );
      }
    }

    // Remove WebSocket provider listeners
    this.wsProvider.removeAllListeners();
  }

  // Public methods for runtime contract management
  async addContract(contractConfig: ContractConfig): Promise<void> {
    if (this.isRunning()) {
      await this.setupContract(contractConfig);
      this.logger.log(`Dynamically added contract: ${contractConfig.name}`);
    }
  }

  async removeContract(address: string): Promise<void> {
    const contractInstance = this.contractInstances.get(address.toLowerCase());
    if (contractInstance) {
      contractInstance.contract.removeAllListeners();
      this.contractInstances.delete(address.toLowerCase());
      this.logger.log(
        `Dynamically removed contract: ${contractInstance.config.name}`,
      );
    }
  }

  getMonitoredContracts(): ContractConfig[] {
    return Array.from(this.contractInstances.values()).map(
      (instance) => instance.config,
    );
  }
}
