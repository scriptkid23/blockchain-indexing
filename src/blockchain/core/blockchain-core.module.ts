import { Module } from '@nestjs/common';
import { EventDispatcherService } from './event-dispatcher.service';
import { SdkRegistryService } from './sdk-registry.service';
import { ListenerFactoryService } from './listener-factory.service';
import { BlockchainConfigService } from '../config/blockchain.config';
import { ConfigDataModule } from '../config-data/config-data.module';

@Module({
  imports: [ConfigDataModule],
  providers: [
    EventDispatcherService,
    SdkRegistryService,
    ListenerFactoryService,
    BlockchainConfigService,
  ],
  exports: [
    EventDispatcherService,
    SdkRegistryService,
    ListenerFactoryService,
    BlockchainConfigService,
  ],
})
export class BlockchainCoreModule {}
