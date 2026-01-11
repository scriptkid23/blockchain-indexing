import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ChainConfig,
  ChainConfigDocument,
} from '../schemas/chain-config.schema';

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
    return [
      // Ethereum Sepolia Testnet - Only this chain
      {
        chainId: 11155111,
        name: 'Ethereum testnet Sepolia',
        symbol: 'TETHSPL',
        type: 'evm',
        rpcUrls: (
          process.env.ETH_SEPOLIA_RPC_URLS ||
          process.env.ETH_SEPOLIA_RPC_URL ||
          'https://ethereum-sepolia-rpc.publicnode.com,https://api.zan.top/eth-sepolia,https://ethereum-sepolia.gateway.tatum.io,https://eth-sepolia-testnet.api.pocket.network'
        )
          .split(',')
          .map((url) => url.trim())
          .filter((url) => !!url),
        wsUrl:
          process.env.ETH_SEPOLIA_WS_URL ||
          'wss://sepolia.infura.io/ws/v3/YOUR_PROJECT_ID',
        strategy: 'block_scan', // Use block_scan for testnet
        enabled: true, // Enable Sepolia
        isTestnet: true,
        explorerUrl: 'https://sepolia.etherscan.io',
        nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 },
      },
    ];
  }
}
