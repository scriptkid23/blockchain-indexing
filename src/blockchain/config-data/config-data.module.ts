import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigCacheService } from './config-cache.service';
import { ChainConfigService } from '../services/chain-config.service';
import { ContractConfigService } from '../services/contract-config.service';
import { ChainConfig, ChainConfigSchema } from '../schemas/chain-config.schema';
import { ContractConfig, ContractConfigSchema } from '../schemas/contract-config.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChainConfig.name, schema: ChainConfigSchema },
      { name: ContractConfig.name, schema: ContractConfigSchema },
    ]),
  ],
  providers: [ConfigCacheService, ChainConfigService, ContractConfigService],
  exports: [ConfigCacheService, ChainConfigService, ContractConfigService],
})
export class ConfigDataModule {}
