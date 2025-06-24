import { Module, OnModuleInit } from '@nestjs/common';

// Core services
import { BlockchainConfigService } from './config/blockchain.config';
import { SdkRegistryService } from './core/sdk-registry.service';
import { EventDispatcherService } from './core/event-dispatcher.service';
import { ListenerFactoryService } from './core/listener-factory.service';
import { BlockchainService } from './blockchain.service';

// Blockchain specific modules
import { EvmModule } from './evm/evm.module';
import { EvmSdkService } from './evm/evm-sdk.service';

// Event handlers
import { TokenDistributorHandler } from './handlers/token-distributor.handler';

// Interfaces
import { ChainType } from './interfaces/blockchain.interface';

@Module({
  imports: [
    EvmModule,
  ],
  providers: [
    BlockchainConfigService,
    SdkRegistryService,
    EventDispatcherService,
    ListenerFactoryService,
    BlockchainService,
    TokenDistributorHandler,
  ],
  exports: [
    BlockchainConfigService,
    SdkRegistryService,
    EventDispatcherService,
    ListenerFactoryService,
    BlockchainService,
  ],
})
export class BlockchainModule implements OnModuleInit {
  constructor(
    private readonly sdkRegistry: SdkRegistryService,
    private readonly configService: BlockchainConfigService,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly tokenDistributorHandler: TokenDistributorHandler,
  ) {}

  async onModuleInit() {
    // Register event handlers
    this.eventDispatcher.registerHandler(this.tokenDistributorHandler);

    // Register SDK factories
    await this.registerSdkFactories();
  }

  private async registerSdkFactories() {
    // Register EVM SDK factory
    this.sdkRegistry.registerSDKFactory(
      ChainType.EVM,
      async (chainId: number) => {
        return new EvmSdkService(
          chainId,
          this.configService,
          this.eventDispatcher,
        );
      }
    );

    // TODO: Register Solana SDK factory when implemented
    // this.sdkRegistry.registerSDKFactory(
    //   ChainType.SOLANA,
    //   async (chainId: number) => {
    //     return new SolanaSdkService(
    //       chainId,
    //       this.configService,
    //       this.eventDispatcher,
    //     );
    //   }
    // );

    // TODO: Register SUI SDK factory when implemented
    // this.sdkRegistry.registerSDKFactory(
    //   ChainType.SUI,
    //   async (chainId: number) => {
    //     return new SuiSdkService(
    //       chainId,
    //       this.configService,
    //       this.eventDispatcher,
    //     );
    //   }
    // );
  }
} 