import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ChainConfig,
  ChainConfigDocument,
} from '../schemas/chain-config.schema';
import * as seedData from './test.seed.json';

@Injectable()
export class ChainConfigSeeder {
  private readonly logger = new Logger(ChainConfigSeeder.name);

  constructor(
    @InjectModel(ChainConfig.name)
    private chainConfigModel: Model<ChainConfigDocument>,
  ) {}

  async seed(): Promise<void> {
    this.logger.log('Starting chain config seeding...');

    const chainConfigs = this.getChainConfigs();

    for (const config of chainConfigs) {
      try {
        const existing = await this.chainConfigModel.findOne({ 
          chainId: config.chainId 
        });

        if (!existing) {
          await this.chainConfigModel.create(config);
          this.logger.log(
            `✅ Created chain config for ${config.name} (${config.chainId})`,
          );
        } else {
          this.logger.log(
            `⏭️  Chain config already exists for ${config.name} (${config.chainId}) - skipping`,
          );
        }
      } catch (error) {
        this.logger.error(`Failed to seed ${config.name}:`, error);
      }
    }

    this.logger.log('Chain config seeding completed');
  }

  private getChainConfigs(): Partial<ChainConfig>[] {
    const chains = (seedData as any).chains || [];

    return chains.map((chain: any) => {
      const rpcUrlsEnv =
        process.env.ETH_SEPOLIA_RPC_URLS || process.env.ETH_SEPOLIA_RPC_URL;
      const rpcUrls = rpcUrlsEnv
        ? rpcUrlsEnv
            .split(',')
            .map((url) => url.trim())
            .filter((url) => !!url)
        : (chain.rpcUrls || []).map((url) => url.trim()).filter((url) => !!url);

      const wsUrl = process.env.ETH_SEPOLIA_WS_URL || chain.wsUrl;

      return {
        ...chain,
        rpcUrls,
        wsUrl,
      };
    });
  }
}
