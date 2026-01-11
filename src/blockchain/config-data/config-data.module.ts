import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigDataService } from './config-data.service';
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
  providers: [ConfigDataService, ChainConfigService, ContractConfigService],
  exports: [ConfigDataService],
})
export class ConfigDataModule {}
