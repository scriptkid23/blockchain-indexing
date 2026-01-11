import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import {
  BlockchainEvent,
  BlockchainEventSchema,
} from './schemas/blockchain-event.schema';
import { ChainConfig, ChainConfigSchema } from './schemas/chain-config.schema';

// Core Modules
import { ConfigDataModule } from './config-data/config-data.module';
import { BlockchainCoreModule } from './core/blockchain-core.module';
import { EvmModule } from './evm/evm.module';

// Main Service
import { BlockchainService } from './blockchain.service';

// Seeders
import { ChainConfigSeeder } from './seeders/chain-config.seeder';
import { ContractConfigSeeder } from './seeders/contract-config.seeder';

// Event handlers
import { ERC20TransferHandler } from './handlers/erc20-transfer.handler';
import { EventDispatcherService } from './core/event-dispatcher.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BlockchainEvent.name, schema: BlockchainEventSchema },
      { name: ChainConfig.name, schema: ChainConfigSchema },
    ]),
    ConfigDataModule,
    BlockchainCoreModule,
    EvmModule,
  ],
  providers: [
    // Main Service
    BlockchainService,

    // Seeders
    ChainConfigSeeder,
    ContractConfigSeeder,

    // Event handlers
    ERC20TransferHandler,
  ],
  exports: [
    BlockchainService,
    ConfigDataModule,
    BlockchainCoreModule,
  ],
})
export class BlockchainModule implements OnModuleInit {
  constructor(
    private readonly eventDispatcher: EventDispatcherService,
    private readonly erc20Handler: ERC20TransferHandler,
  ) {}

  onModuleInit() {
    this.registerEventHandlers();
  }

  private registerEventHandlers() {
    this.eventDispatcher.registerHandler(this.erc20Handler);
  }
}
