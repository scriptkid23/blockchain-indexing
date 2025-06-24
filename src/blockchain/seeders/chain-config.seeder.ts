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
        await this.chainConfigModel.findOneAndUpdate(
          { chainId: config.chainId },
          config,
          { upsert: true, new: true },
        );
        this.logger.log(
          `Seeded chain config for ${config.name} (${config.chainId})`,
        );
      } catch (error) {
        this.logger.error(`Failed to seed ${config.name}:`, error);
      }
    }

    this.logger.log('Chain config seeding completed');
  }

  private getChainConfigs(): Partial<ChainConfig>[] {
    return [
      // Ethereum Mainnet
      {
        chainId: 1,
        name: 'Ethereum Mainnet',
        symbol: 'ETH',
        type: 'evm',
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        wsUrl: 'wss://ethereum-rpc.publicnode.com',
        strategy: 'websocket',
        enabled: true, // Enable Ethereum for multi-token support
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        metadata: {
          explorer: 'https://etherscan.io',
          logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
          totalValueLocked: 'Very High',
          popularTokens: ['USDT', 'USDC', 'WETH', 'DAI', 'SHIB'],
          priority: 'high',
        },
      },

      // Binance Smart Chain
      {
        chainId: 56,
        name: 'BNB Smart Chain',
        symbol: 'BNB',
        type: 'evm',
        rpcUrl: 'https://bsc-rpc.publicnode.com',
        wsUrl: 'wss://bsc-rpc.publicnode.com',
        strategy: 'websocket',
        enabled: true, // Enable BSC for USDT/USDC
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
        metadata: {
          explorer: 'https://bscscan.com',
          logo: 'https://cryptologos.cc/logos/bnb-bnb-logo.png',
          totalValueLocked: 'High',
          popularTokens: ['USDT', 'USDC', 'WETH'],
          priority: 'high',
        },
      },

      // Polygon
      {
        chainId: 137,
        name: 'Polygon',
        symbol: 'MATIC',
        type: 'evm',
        rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
        wsUrl: 'wss://polygon-bor-rpc.publicnode.com',
        strategy: 'websocket',
        enabled: true, // Enable Polygon for USDT/USDC/DAI
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        metadata: {
          explorer: 'https://polygonscan.com',
          logo: 'https://cryptologos.cc/logos/polygon-matic-logo.png',
          totalValueLocked: 'Medium',
          popularTokens: ['USDT', 'USDC', 'WETH', 'DAI'],
          priority: 'medium',
        },
      },

      // Arbitrum One
      {
        chainId: 42161,
        name: 'Arbitrum One',
        symbol: 'AETH',
        type: 'evm',
        rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
        wsUrl: 'wss://arbitrum-one-rpc.publicnode.com',
        strategy: 'websocket',
        enabled: false, // Disabled by default (can be enabled later)
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        metadata: {
          explorer: 'https://arbiscan.io',
          logo: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png',
          totalValueLocked: 'Medium',
          popularTokens: ['USDT', 'USDC', 'WETH'],
          priority: 'medium',
        },
      },

      // Optimism
      {
        chainId: 10,
        name: 'Optimism',
        symbol: 'OPT',
        type: 'evm',
        rpcUrl: 'https://optimism-rpc.publicnode.com',
        wsUrl: 'wss://optimism-rpc.publicnode.com',
        strategy: 'websocket',
        enabled: false, // Disabled by default
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        metadata: {
          explorer: 'https://optimistic.etherscan.io',
          logo: 'https://cryptologos.cc/logos/optimism-ethereum-op-logo.png',
          totalValueLocked: 'Medium',
          popularTokens: ['USDT', 'USDC', 'WETH'],
          priority: 'medium',
        },
      },

      // Base
      {
        chainId: 8453,
        name: 'Base',
        symbol: 'BASE',
        type: 'evm',
        rpcUrl: 'https://base-rpc.publicnode.com',
        wsUrl: 'wss://base-rpc.publicnode.com',
        strategy: 'websocket',
        enabled: false, // Disabled by default
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        metadata: {
          explorer: 'https://basescan.org',
          logo: 'https://cryptologos.cc/logos/base-base-logo.png',
          totalValueLocked: 'Low',
          popularTokens: ['USDC', 'WETH'],
          priority: 'low',
        },
      },

      // Avalanche C-Chain
      {
        chainId: 43114,
        name: 'Avalanche C-Chain',
        symbol: 'AVAX',
        type: 'evm',
        rpcUrl: 'https://avalanche-c-chain-rpc.publicnode.com',
        wsUrl: 'wss://avalanche-c-chain-rpc.publicnode.com',
        strategy: 'websocket',
        enabled: false, // Disabled by default
        nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
        metadata: {
          explorer: 'https://snowtrace.io',
          logo: 'https://cryptologos.cc/logos/avalanche-avax-logo.png',
          totalValueLocked: 'Medium',
          popularTokens: ['USDT', 'USDC', 'WETH'],
          priority: 'medium',
        },
      },

      // Solana (for future expansion)
      {
        chainId: 900,
        name: 'Solana Mainnet',
        symbol: 'SOL',
        type: 'solana',
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        wsUrl: '',
        strategy: 'websocket',
        enabled: false, // Disabled - not implemented yet
        nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
        metadata: {
          explorer: 'https://explorer.solana.com',
          logo: 'https://cryptologos.cc/logos/solana-sol-logo.png',
          totalValueLocked: 'High',
          popularTokens: ['USDT', 'USDC'],
          priority: 'low',
          note: 'Not implemented yet',
        },
      },

      // SUI (for future expansion)
      {
        chainId: 1000,
        name: 'SUI Mainnet',
        symbol: 'SUI',
        type: 'sui',
        rpcUrl: 'https://fullnode.mainnet.sui.io:443',
        wsUrl: '',
        strategy: 'websocket',
        enabled: false, // Disabled - not implemented yet
        nativeCurrency: { name: 'SUI', symbol: 'SUI', decimals: 9 },
        metadata: {
          explorer: 'https://explorer.sui.io',
          logo: 'https://cryptologos.cc/logos/sui-sui-logo.png',
          totalValueLocked: 'Low',
          popularTokens: ['USDT', 'USDC'],
          priority: 'low',
          note: 'Not implemented yet',
        },
      },

      // EVM Testnets
      {
        chainId: 11155111,
        name: 'Ethereum testnet Sepolia',
        symbol: 'TETHSPL',
        type: 'evm',
        rpcUrl:
          process.env.ETH_SEPOLIA_RPC_URL ||
          'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
        wsUrl:
          process.env.ETH_SEPOLIA_WS_URL ||
          'wss://sepolia.infura.io/ws/v3/YOUR_PROJECT_ID',
        strategy: 'websocket',
        enabled: false,
        isTestnet: true,
        explorerUrl: 'https://sepolia.etherscan.io',
        nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 },
      },
      {
        chainId: 97,
        name: 'BSC Testnet',
        symbol: 'TBSC',
        type: 'evm',
        rpcUrl:
          process.env.BSC_TESTNET_RPC_URL ||
          'https://data-seed-prebsc-1-s1.binance.org:8545',
        strategy: 'block_scan',
        enabled: false,
        isTestnet: true,
        explorerUrl: 'https://testnet.bscscan.com',
        nativeCurrency: { name: 'Test BNB', symbol: 'tBNB', decimals: 18 },
      },

      // Non-EVM Chains
      {
        chainId: 901,
        name: 'Solana Devnet',
        symbol: 'DSOL',
        type: 'solana',
        rpcUrl:
          process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com',
        wsUrl:
          process.env.SOLANA_DEVNET_WS_URL || 'wss://api.devnet.solana.com',
        strategy: 'websocket',
        enabled: false,
        isTestnet: true,
        explorerUrl: 'https://explorer.solana.com?cluster=devnet',
        nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
      },
      {
        chainId: 101,
        name: 'Sui',
        symbol: 'SUI',
        type: 'sui',
        rpcUrl:
          process.env.SUI_RPC_URL || 'https://fullnode.mainnet.sui.io:443',
        strategy: 'block_scan',
        enabled: false,
        isTestnet: false,
        explorerUrl: 'https://explorer.sui.io',
        nativeCurrency: { name: 'Sui', symbol: 'SUI', decimals: 9 },
      },
      {
        chainId: 102,
        name: 'Sui Devnet',
        symbol: 'DSUI',
        type: 'sui',
        rpcUrl:
          process.env.SUI_DEVNET_RPC_URL ||
          'https://fullnode.devnet.sui.io:443',
        strategy: 'block_scan',
        enabled: false,
        isTestnet: true,
        explorerUrl: 'https://explorer.sui.io?network=devnet',
        nativeCurrency: { name: 'Sui', symbol: 'SUI', decimals: 9 },
      },
    ];
  }
}
