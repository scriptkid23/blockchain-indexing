import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import { ChainConfig, ChainConfigSchema } from './schemas/chain-config.schema';
import {
  ContractData,
  ContractDataSchema,
} from './schemas/contract-data.schema';
import {
  BlockchainEvent,
  BlockchainEventSchema,
} from './schemas/blockchain-event.schema';
import {
  ContractConfig,
  ContractConfigSchema,
} from './schemas/contract-config.schema';

// Core services
import { BlockchainConfigService } from './config/blockchain.config';
import { SdkRegistryService } from './core/sdk-registry.service';
import { EventDispatcherService } from './core/event-dispatcher.service';
import { ListenerFactoryService } from './core/listener-factory.service';
import { BlockchainService } from './blockchain.service';

// Database services
import { ChainConfigService } from './services/chain-config.service';
import { ContractDataService } from './services/contract-data.service';
import { ContractConfigService } from './services/contract-config.service';

// Seeders
import { ChainConfigSeeder } from './seeders/chain-config.seeder';
import { ContractConfigSeeder } from './seeders/contract-config.seeder';

// Blockchain specific modules
import { EvmModule } from './evm/evm.module';
import { EvmSdkService } from './evm/evm-sdk.service';

// Event handlers
import { ERC20TransferHandler } from './handlers/erc20-transfer.handler';

// Interfaces
import { ChainType } from './interfaces/blockchain.interface';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChainConfig.name, schema: ChainConfigSchema },
      { name: ContractData.name, schema: ContractDataSchema },
      { name: BlockchainEvent.name, schema: BlockchainEventSchema },
      { name: ContractConfig.name, schema: ContractConfigSchema },
    ]),
    EvmModule,
  ],
  providers: [
    // Database services
    ChainConfigService,
    ContractDataService,
    ContractConfigService,
    ChainConfigSeeder,
    ContractConfigSeeder,

    // Core services
    BlockchainConfigService,
    SdkRegistryService,
    EventDispatcherService,
    ListenerFactoryService,
    BlockchainService,

    // Event handlers
    ERC20TransferHandler,
  ],
  exports: [
    // Database services
    ChainConfigService,
    ContractDataService,

    // Core services
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
    private readonly contractConfigService: ContractConfigService,
    private readonly chainConfigSeeder: ChainConfigSeeder,
    private readonly contractConfigSeeder: ContractConfigSeeder,
    private readonly erc20Handler: ERC20TransferHandler,
  ) {}

  async onModuleInit() {
    // Seed data
    await this.chainConfigSeeder.seed();
    await this.contractConfigSeeder.seed();

    // Register SDK factories
    await this.registerSdkFactories();

    // Register event handlers
    this.registerEventHandlers();
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
          this.contractConfigService,
        );
      },
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

  private registerEventHandlers() {
    // Register ERC20 Transfer Handler
    this.eventDispatcher.registerHandler(this.erc20Handler);

    // Add more handlers here as needed
    // this.eventDispatcher.registerHandler(this.otherHandler);
  }
}
