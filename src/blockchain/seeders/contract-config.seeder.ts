import { Injectable, Logger } from '@nestjs/common';
import {
  ContractConfigService,
  CreateContractConfigDto,
} from '../services/contract-config.service';

// Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_EVENT_SIGNATURE =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Approval event signature: Approval(address indexed owner, address indexed spender, uint256 value)
const APPROVAL_EVENT_SIGNATURE =
  '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';

// Standard ERC-20 ABI for Transfer and Approval events
const ERC20_EVENTS_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

// Multi-chain contract configurations
interface MultiChainContract {
  name: string;
  symbol: string;
  type: string;
  description: string;
  metadata: any;
  deployments: {
    chainId: number;
    address: string;
    enabled: boolean;
  }[];
}

@Injectable()
export class ContractConfigSeeder {
  private readonly logger = new Logger(ContractConfigSeeder.name);

  constructor(private readonly contractConfigService: ContractConfigService) {}

  async seed(): Promise<void> {
    this.logger.log('Starting multi-chain contract config seeding...');

    try {
      await this.seedMultiChainContracts();
      this.logger.log('Multi-chain contract config seeding completed successfully');
    } catch (error) {
      this.logger.error('Error during contract config seeding:', error);
      throw error;
    }
  }

  private async seedMultiChainContracts(): Promise<void> {
    const multiChainContracts: MultiChainContract[] = [
      // USDT (Tether USD) - Multiple chains
      {
        name: 'Tether USD',
        symbol: 'USDT',
        type: 'erc20',
        description: 'USDT stablecoin deployed across multiple chains',
        metadata: {
          decimals: 6, // Note: USDT uses 6 decimals on most chains
          isStablecoin: true,
          priority: 'high',
          volume: 'very_high',
          website: 'https://tether.to',
          coingeckoId: 'tether',
        },
        deployments: [
          { chainId: 1, address: '0xdac17f958d2ee523a2206206994597c13d831ec7', enabled: true }, // Ethereum
          { chainId: 56, address: '0x55d398326f99059ff775485246999027b3197955', enabled: true }, // BSC
          { chainId: 137, address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', enabled: true }, // Polygon
          { chainId: 42161, address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', enabled: false }, // Arbitrum
          { chainId: 10, address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', enabled: false }, // Optimism
        ],
      },

      // USDC (USD Coin) - Multiple chains
      {
        name: 'USD Coin',
        symbol: 'USDC',
        type: 'erc20',
        description: 'USDC stablecoin deployed across multiple chains',
        metadata: {
          decimals: 6,
          isStablecoin: true,
          priority: 'high',
          volume: 'high',
          website: 'https://www.centre.io',
          coingeckoId: 'usd-coin',
        },
        deployments: [
          { chainId: 1, address: '0xa0b86a33e6441b8331265c164b7a03ba0d5a2b3a', enabled: true }, // Ethereum
          { chainId: 56, address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', enabled: true }, // BSC
          { chainId: 137, address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', enabled: true }, // Polygon
          { chainId: 42161, address: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', enabled: false }, // Arbitrum
          { chainId: 10, address: '0x7f5c764cbc14f9669b88837ca1490cca17c31607', enabled: false }, // Optimism
        ],
      },

      // WETH (Wrapped Ether) - Multiple chains
      {
        name: 'Wrapped Ether',
        symbol: 'WETH',
        type: 'erc20',
        description: 'Wrapped Ether for DeFi compatibility',
        metadata: {
          decimals: 18,
          isStablecoin: false,
          priority: 'medium',
          volume: 'high',
          website: 'https://weth.io',
          coingeckoId: 'weth',
        },
        deployments: [
          { chainId: 1, address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', enabled: false }, // Ethereum
          { chainId: 56, address: '0x2170ed0880ac9a755fd29b2688956bd959f933f8', enabled: false }, // BSC (ETH)
          { chainId: 137, address: '0x7ceb23fd6c98e3e8f29bb3a4af1e8c6a6e0c9f9e', enabled: false }, // Polygon
          { chainId: 42161, address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', enabled: false }, // Arbitrum
        ],
      },

      // DAI (Dai Stablecoin) - Multiple chains
      {
        name: 'Dai Stablecoin',
        symbol: 'DAI',
        type: 'erc20',
        description: 'DAI decentralized stablecoin',
        metadata: {
          decimals: 18,
          isStablecoin: true,
          priority: 'medium',
          volume: 'medium',
          website: 'https://makerdao.com',
          coingeckoId: 'dai',
        },
        deployments: [
          { chainId: 1, address: '0x6b175474e89094c44da98b954eedeac495271d0f', enabled: false }, // Ethereum
          { chainId: 56, address: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3', enabled: false }, // BSC
          { chainId: 137, address: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', enabled: false }, // Polygon
        ],
      },

      // SHIB (Shiba Inu) - Primarily Ethereum
      {
        name: 'Shiba Inu',
        symbol: 'SHIB',
        type: 'erc20',
        description: 'Shiba Inu meme token',
        metadata: {
          decimals: 18,
          isStablecoin: false,
          priority: 'low',
          volume: 'medium',
          website: 'https://shibainu.com',
          coingeckoId: 'shiba-inu',
        },
        deployments: [
          { chainId: 1, address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', enabled: false }, // Ethereum
        ],
      },
    ];

    // Process each multi-chain contract
    for (const multiChainContract of multiChainContracts) {
      await this.processMultiChainContract(multiChainContract);
    }
  }

  private async processMultiChainContract(multiChainContract: MultiChainContract): Promise<void> {
    this.logger.log(`Processing ${multiChainContract.symbol} across ${multiChainContract.deployments.length} chains`);

    for (const deployment of multiChainContract.deployments) {
      const contractConfig: CreateContractConfigDto = {
        address: deployment.address,
        chainId: deployment.chainId,
        name: multiChainContract.name,
        symbol: multiChainContract.symbol,
        type: multiChainContract.type,
        events: [TRANSFER_EVENT_SIGNATURE, APPROVAL_EVENT_SIGNATURE],
        abi: ERC20_EVENTS_ABI,
        enabled: deployment.enabled,
        description: `${multiChainContract.description} (Chain ID: ${deployment.chainId})`,
        metadata: {
          ...multiChainContract.metadata,
          chainId: deployment.chainId,
          isMultiChain: true,
          totalDeployments: multiChainContract.deployments.length,
        },
      };

      try {
        const existing = await this.contractConfigService.findByAddress(
          contractConfig.address,
          contractConfig.chainId,
        );

        if (!existing) {
          await this.contractConfigService.create(contractConfig);
          this.logger.log(
            `✅ Created: ${contractConfig.symbol} on chain ${contractConfig.chainId} (${deployment.enabled ? 'ENABLED' : 'DISABLED'})`,
          );
        } else {
          this.logger.log(
            `⏭️  Exists: ${contractConfig.symbol} on chain ${contractConfig.chainId} (${existing.enabled ? 'ENABLED' : 'DISABLED'})`,
          );
        }
      } catch (error) {
        this.logger.error(
          `❌ Error processing ${contractConfig.symbol} on chain ${contractConfig.chainId}:`,
          error,
        );
      }
    }
  }

  // Helper method to enable/disable contracts by symbol across all chains
  async updateContractsBySymbol(
    symbol: string,
    enabled: boolean,
  ): Promise<void> {
    try {
      const contracts = await this.contractConfigService.findBySymbol(symbol);
      
      for (const contract of contracts) {
        await this.contractConfigService.updateEnabled(
          contract.address,
          contract.chainId,
          enabled,
        );
      }
      
      this.logger.log(
        `Updated ${contracts.length} ${symbol} contracts to ${enabled ? 'enabled' : 'disabled'}`,
      );
    } catch (error) {
      this.logger.error(
        `Error updating contracts for symbol ${symbol}:`,
        error,
      );
    }
  }

  // Helper method to enable/disable contracts by chain
  async updateContractsByChain(
    chainId: number,
    enabled: boolean,
  ): Promise<void> {
    try {
      const contracts = await this.contractConfigService.findByChainId(chainId);
      
      for (const contract of contracts) {
        await this.contractConfigService.updateEnabled(
          contract.address,
          contract.chainId,
          enabled,
        );
      }
      
      this.logger.log(
        `Updated ${contracts.length} contracts on chain ${chainId} to ${enabled ? 'enabled' : 'disabled'}`,
      );
    } catch (error) {
      this.logger.error(
        `Error updating contracts for chain ${chainId}:`,
        error,
      );
    }
  }

  // Enable specific configurations (examples)
  async enableUSDTOnly(): Promise<void> {
    this.logger.log('Enabling USDT only across all chains...');
    await this.updateContractsBySymbol('USDT', true);
    await this.updateContractsBySymbol('USDC', false);
    await this.updateContractsBySymbol('WETH', false);
    await this.updateContractsBySymbol('DAI', false);
    await this.updateContractsBySymbol('SHIB', false);
    this.logger.log('USDT-only mode activated');
  }

  async enableStablecoinsOnly(): Promise<void> {
    this.logger.log('Enabling stablecoins only...');
    await this.updateContractsBySymbol('USDT', true);
    await this.updateContractsBySymbol('USDC', true);
    await this.updateContractsBySymbol('DAI', true);
    await this.updateContractsBySymbol('WETH', false);
    await this.updateContractsBySymbol('SHIB', false);
    this.logger.log('Stablecoins-only mode activated');
  }

  async enableEthereumMainnetOnly(): Promise<void> {
    this.logger.log('Enabling Ethereum mainnet contracts only...');
    await this.updateContractsByChain(1, true); // Ethereum
    await this.updateContractsByChain(56, false); // BSC
    await this.updateContractsByChain(137, false); // Polygon
    await this.updateContractsByChain(42161, false); // Arbitrum
    this.logger.log('Ethereum mainnet-only mode activated');
  }
}
