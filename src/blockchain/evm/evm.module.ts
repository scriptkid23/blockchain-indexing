import { Module } from '@nestjs/common';
import { EvmSdkFactory } from './evm-sdk.factory';
import { ConfigDataModule } from '../config-data/config-data.module';
import { BlockchainCoreModule } from '../core/blockchain-core.module';

@Module({
  imports: [ConfigDataModule, BlockchainCoreModule],
  providers: [EvmSdkFactory],
  exports: [EvmSdkFactory],
})
export class EvmModule {}
