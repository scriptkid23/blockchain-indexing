import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import {
  IBlockchainSDK,
  IBlockchainListener,
  ChainType,
  EventStrategy,
} from '../interfaces/blockchain.interface';
import { BlockchainConfigService } from '../config/blockchain.config';
import { EventDispatcherService } from '../core/event-dispatcher.service';
import { ContractConfigService } from '../services/contract-config.service';
import { EvmWebSocketListener } from './listeners/evm-websocket.listener';
import { EvmBlockScanListener } from './listeners/evm-block-scan.listener';

@Injectable()
export class EvmSdkService implements IBlockchainSDK {
  private readonly logger = new Logger(EvmSdkService.name);
  public readonly chainType = ChainType.EVM;

  private provider: ethers.JsonRpcProvider | null = null;
  private wsProvider: ethers.WebSocketProvider | null = null;
  private _chainId: number;

  constructor(
    chainId: number,
    private readonly configService: BlockchainConfigService,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly contractConfigService: ContractConfigService,
  ) {
    this._chainId = chainId;
  }

  get chainId(): number {
    return this._chainId;
  }

  async connect(): Promise<void> {
    const config = this.configService.getChainConfig(this.chainId);
    if (!config) {
      throw new Error(`Configuration not found for chain ${this.chainId}`);
    }

    try {
      // Initialize HTTP provider
      this.provider = new ethers.JsonRpcProvider(config.rpcUrl);

      // Test connection
      const network = await this.provider.getNetwork();
      if (Number(network.chainId) !== this.chainId) {
        throw new Error(
          `Chain ID mismatch: expected ${this.chainId}, got ${network.chainId}`,
        );
      }

      // Initialize WebSocket provider if URL is provided
      if (config.wsUrl) {
        try {
          this.wsProvider = new ethers.WebSocketProvider(config.wsUrl);
          await this.wsProvider.getNetwork(); // Test WebSocket connection
        } catch (error) {
          this.logger.warn(
            `Failed to connect WebSocket for chain ${this.chainId}:`,
            error,
          );
          this.wsProvider = null;
        }
      }

      this.logger.log(
        `Connected to ${config.name} (Chain ID: ${this.chainId})`,
      );
    } catch (error) {
      this.logger.error(`Failed to connect to chain ${this.chainId}:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.wsProvider) {
      await this.wsProvider.destroy();
      this.wsProvider = null;
    }

    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }

    this.logger.log(`Disconnected from chain ${this.chainId}`);
  }

  createListener(strategy: EventStrategy): IBlockchainListener {
    const config = this.configService.getChainConfig(this.chainId);
    if (!config) {
      throw new Error(`Configuration not found for chain ${this.chainId}`);
    }

    switch (strategy) {
      case EventStrategy.WEBSOCKET:
        if (!this.wsProvider) {
          throw new Error(
            `WebSocket provider not available for chain ${this.chainId}`,
          );
        }
        return new EvmWebSocketListener(
          this.chainId,
          this.wsProvider,
          this.eventDispatcher,
          config,
          this.contractConfigService,
        );

      case EventStrategy.BLOCK_SCAN:
        if (!this.provider) {
          throw new Error(
            `HTTP provider not available for chain ${this.chainId}`,
          );
        }
        return new EvmBlockScanListener(
          this.chainId,
          this.provider,
          this.eventDispatcher,
          config,
          this.contractConfigService,
        );

      case EventStrategy.HYBRID:
        // For hybrid, prefer WebSocket but fallback to block scan
        if (this.wsProvider) {
          return new EvmWebSocketListener(
            this.chainId,
            this.wsProvider,
            this.eventDispatcher,
            config,
            this.contractConfigService,
          );
        } else if (this.provider) {
          return new EvmBlockScanListener(
            this.chainId,
            this.provider,
            this.eventDispatcher,
            config,
            this.contractConfigService,
          );
        }
        throw new Error(
          `No provider available for hybrid strategy on chain ${this.chainId}`,
        );

      default:
        throw new Error(`Unsupported event strategy: ${strategy}`);
    }
  }

  async getLatestBlock(): Promise<number> {
    if (!this.provider) {
      throw new Error(`Provider not available for chain ${this.chainId}`);
    }

    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      this.logger.error(
        `Failed to get latest block for chain ${this.chainId}:`,
        error,
      );
      throw error;
    }
  }

  getProvider(): ethers.JsonRpcProvider | null {
    return this.provider;
  }

  getWebSocketProvider(): ethers.WebSocketProvider | null {
    return this.wsProvider;
  }

  isConnected(): boolean {
    return this.provider !== null;
  }

  hasWebSocketConnection(): boolean {
    return this.wsProvider !== null;
  }
}
