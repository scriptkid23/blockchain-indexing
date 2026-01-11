import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { SdkRegistryService } from './core/sdk-registry.service';
import { ListenerFactoryService } from './core/listener-factory.service';
import { BlockchainConfigService } from './config/blockchain.config';
import { ChainType } from './interfaces/blockchain.interface';
import { EvmSdkFactory } from './evm/evm-sdk.factory';
import { ChainConfigSeeder } from './seeders/chain-config.seeder';
import { ContractConfigSeeder } from './seeders/contract-config.seeder';

@Injectable()
export class BlockchainService
  implements OnModuleInit, OnModuleDestroy, OnApplicationBootstrap
{
  private readonly logger = new Logger(BlockchainService.name);

  constructor(
    private readonly sdkRegistry: SdkRegistryService,
    private readonly listenerFactory: ListenerFactoryService,
    private readonly configService: BlockchainConfigService,
    private readonly chainConfigSeeder: ChainConfigSeeder,
    private readonly contractConfigSeeder: ContractConfigSeeder,
    private readonly evmSdkFactory: EvmSdkFactory,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Blockchain Indexing Service...');
    await this.initialize();
  }

  async onApplicationBootstrap() {
    // Start blockchain listeners after application is fully bootstrapped
    // This ensures all event handlers are registered before we start listening
    await this.startListeners();
  }

  async initialize(): Promise<void> {
    // Seed database with chain and contract configurations
    await this.chainConfigSeeder.seed();
    await this.contractConfigSeeder.seed();

    // Ensure SDK factories are registered
    this.registerSdkFactories();

    this.logger.log('Blockchain service initialization complete');
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down Blockchain Indexing Service...');
    await this.stopAllListeners();
    await this.sdkRegistry.disconnectAll();
  }

  async startListeners(): Promise<void> {
    const enabledConfigs = this.configService.getEnabledChainConfigs();

    this.logger.log(
      `Starting listeners for ${enabledConfigs.length} chains...`,
    );

    for (const config of enabledConfigs) {
      try {
        const sdk = await this.sdkRegistry.getSDK(config.chainId);
        if (!sdk) {
          this.logger.warn(`Could not get SDK for chain ${config.chainId}`);
          continue;
        }

        await this.listenerFactory.startListener(sdk, config.strategy);
      } catch (error) {
        this.logger.error(
          `Failed to start listener for chain ${config.chainId}:`,
          error,
        );
      }
    }

    this.logger.log('All listeners started');
  }

  async stopAllListeners(): Promise<void> {
    await this.listenerFactory.stopAllListeners();
  }

  /**
   * Register SDK factories for supported chain types.
   * Currently only EVM is implemented.
   */
  private registerSdkFactories() {
    this.sdkRegistry.registerSDKFactory(
      ChainType.EVM,
      async (chainId: number) => this.evmSdkFactory.create(chainId),
    );
  }
}
