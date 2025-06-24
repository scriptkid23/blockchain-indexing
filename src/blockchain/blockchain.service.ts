import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SdkRegistryService } from './core/sdk-registry.service';
import { ListenerFactoryService } from './core/listener-factory.service';
import { BlockchainConfigService } from './config/blockchain.config';
import { EventDispatcherService } from './core/event-dispatcher.service';
import { ChainType, EventStrategy } from './interfaces/blockchain.interface';

@Injectable()
export class BlockchainService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlockchainService.name);

  constructor(
    private readonly sdkRegistry: SdkRegistryService,
    private readonly listenerFactory: ListenerFactoryService,
    private readonly configService: BlockchainConfigService,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Blockchain Indexing Service...');
    await this.startListeners();
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down Blockchain Indexing Service...');
    await this.stopAllListeners();
    await this.sdkRegistry.disconnectAll();
  }

  async startListeners(): Promise<void> {
    const enabledConfigs = this.configService.getEnabledChainConfigs();
    
    this.logger.log(`Starting listeners for ${enabledConfigs.length} chains...`);
    
    for (const config of enabledConfigs) {
      try {
        const sdk = await this.sdkRegistry.getSDK(config.chainId);
        if (!sdk) {
          this.logger.warn(`Could not get SDK for chain ${config.chainId}`);
          continue;
        }

        await this.listenerFactory.startListener(sdk, config.strategy);
      } catch (error) {
        this.logger.error(`Failed to start listener for chain ${config.chainId}:`, error);
      }
    }

    this.logger.log('All listeners started');
  }

  async stopAllListeners(): Promise<void> {
    await this.listenerFactory.stopAllListeners();
  }

  async restartListener(chainId: number): Promise<void> {
    const config = this.configService.getChainConfig(chainId);
    if (!config) {
      throw new Error(`Configuration not found for chain ${chainId}`);
    }

    // Stop existing listener
    await this.listenerFactory.stopListener(chainId, config.strategy);

    // Start new listener
    const sdk = await this.sdkRegistry.getSDK(chainId);
    if (sdk) {
      await this.listenerFactory.startListener(sdk, config.strategy);
    }
  }

  getSystemStatus() {
    const enabledConfigs = this.configService.getEnabledChainConfigs();
    const activeListeners = this.listenerFactory.getActiveListeners();
    const runningCount = this.listenerFactory.getRunningListenersCount();
    const handlerCount = this.eventDispatcher.getHandlerCount();
    const queueSize = this.eventDispatcher.getQueueSize();
    const supportedChainTypes = this.sdkRegistry.getRegisteredChainTypes();

    return {
      enabled_chains: enabledConfigs.length,
      active_listeners: activeListeners.length,
      running_listeners: runningCount,
      registered_handlers: handlerCount,
      event_queue_size: queueSize,
      supported_chain_types: supportedChainTypes,
      chains: enabledConfigs.map(config => ({
        chain_id: config.chainId,
        name: config.name,
        type: config.type,
        strategy: config.strategy,
        is_running: this.listenerFactory.isListenerRunning(config.chainId, config.strategy),
        is_supported: this.sdkRegistry.isChainSupported(config.chainId),
      })),
    };
  }

  async switchStrategy(chainId: number, newStrategy: EventStrategy): Promise<void> {
    const config = this.configService.getChainConfig(chainId);
    if (!config) {
      throw new Error(`Configuration not found for chain ${chainId}`);
    }

    // Stop current listener
    await this.listenerFactory.stopListener(chainId, config.strategy);

    // Update strategy (in production, this should update persistent storage)
    config.strategy = newStrategy;

    // Start with new strategy
    const sdk = await this.sdkRegistry.getSDK(chainId);
    if (sdk) {
      await this.listenerFactory.startListener(sdk, newStrategy);
    }

    this.logger.log(`Switched chain ${chainId} to ${newStrategy} strategy`);
  }

  async getChainStatus(chainId: number) {
    const config = this.configService.getChainConfig(chainId);
    if (!config) {
      throw new Error(`Configuration not found for chain ${chainId}`);
    }

    const sdk = await this.sdkRegistry.getSDK(chainId);
    const isRunning = this.listenerFactory.isListenerRunning(chainId, config.strategy);

    return {
      chain_id: chainId,
      name: config.name,
      type: config.type,
      strategy: config.strategy,
      enabled: config.enabled,
      is_running: isRunning,
      is_connected: sdk ? true : false,
      latest_block: sdk ? await sdk.getLatestBlock() : null,
    };
  }
} 