import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChainConfig, ChainType, EventStrategy } from '../interfaces/blockchain.interface';

@Injectable()
export class BlockchainConfigService {
  private readonly chainConfigs: Map<number, ChainConfig> = new Map();

  constructor(private configService: ConfigService) {
    this.initializeConfigs();
  }

  private initializeConfigs() {
    // EVM Networks
    this.addChainConfig({
      chainId: 1,
      name: 'Ethereum Mainnet',
      type: ChainType.EVM,
      rpcUrl: this.configService.get('ETH_RPC_URL', 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID'),
      wsUrl: this.configService.get('ETH_WS_URL', 'wss://mainnet.infura.io/ws/v3/YOUR_PROJECT_ID'),
      strategy: EventStrategy.WEBSOCKET,
      enabled: this.configService.get('ETH_ENABLED', true),
    });

    this.addChainConfig({
      chainId: 56,
      name: 'BSC Mainnet',
      type: ChainType.EVM,
      rpcUrl: this.configService.get('BSC_RPC_URL', 'https://bsc-dataseed1.binance.org'),
      wsUrl: this.configService.get('BSC_WS_URL', 'wss://bsc-ws-node.nariox.org:443/ws'),
      strategy: EventStrategy.WEBSOCKET,
      enabled: this.configService.get('BSC_ENABLED', true),
    });

    this.addChainConfig({
      chainId: 137,
      name: 'Polygon Mainnet',
      type: ChainType.EVM,
      rpcUrl: this.configService.get('POLYGON_RPC_URL', 'https://polygon-rpc.com'),
      wsUrl: this.configService.get('POLYGON_WS_URL', 'wss://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY'),
      strategy: EventStrategy.WEBSOCKET,
      enabled: this.configService.get('POLYGON_ENABLED', true),
    });

    this.addChainConfig({
      chainId: 42161,
      name: 'Arbitrum One',
      type: ChainType.EVM,
      rpcUrl: this.configService.get('ARBITRUM_RPC_URL', 'https://arb1.arbitrum.io/rpc'),
      wsUrl: this.configService.get('ARBITRUM_WS_URL', 'wss://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY'),
      strategy: EventStrategy.WEBSOCKET,
      enabled: this.configService.get('ARBITRUM_ENABLED', true),
    });

    // Solana Networks
    this.addChainConfig({
      chainId: 900,
      name: 'Solana Mainnet Beta',
      type: ChainType.SOLANA,
      rpcUrl: this.configService.get('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
      wsUrl: this.configService.get('SOLANA_WS_URL', 'wss://api.mainnet-beta.solana.com'),
      strategy: EventStrategy.WEBSOCKET,
      enabled: this.configService.get('SOLANA_ENABLED', true),
    });

    this.addChainConfig({
      chainId: 901,
      name: 'Solana Devnet',
      type: ChainType.SOLANA,
      rpcUrl: this.configService.get('SOLANA_DEVNET_RPC_URL', 'https://api.devnet.solana.com'),
      wsUrl: this.configService.get('SOLANA_DEVNET_WS_URL', 'wss://api.devnet.solana.com'),
      strategy: EventStrategy.WEBSOCKET,
      enabled: this.configService.get('SOLANA_DEVNET_ENABLED', false),
    });

    // SUI Networks (Future Support)
    this.addChainConfig({
      chainId: 1000,
      name: 'SUI Mainnet',
      type: ChainType.SUI,
      rpcUrl: this.configService.get('SUI_RPC_URL', 'https://fullnode.mainnet.sui.io:443'),
      strategy: EventStrategy.BLOCK_SCAN,
      enabled: this.configService.get('SUI_ENABLED', false),
    });
  }

  private addChainConfig(config: ChainConfig) {
    this.chainConfigs.set(config.chainId, config);
  }

  getChainConfig(chainId: number): ChainConfig | undefined {
    return this.chainConfigs.get(chainId);
  }

  getAllChainConfigs(): ChainConfig[] {
    return Array.from(this.chainConfigs.values());
  }

  getEnabledChainConfigs(): ChainConfig[] {
    return this.getAllChainConfigs().filter(config => config.enabled);
  }

  getChainsByType(type: ChainType): ChainConfig[] {
    return this.getAllChainConfigs().filter(config => config.type === type);
  }

  getEnabledChainsByType(type: ChainType): ChainConfig[] {
    return this.getEnabledChainConfigs().filter(config => config.type === type);
  }
} 