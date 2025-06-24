import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ChainConfig,
  ChainType,
  EventStrategy,
} from '../interfaces/blockchain.interface';
import { ChainConfigService } from '../services/chain-config.service';

@Injectable()
export class BlockchainConfigService implements OnModuleInit {
  private readonly chainConfigs: Map<number, ChainConfig> = new Map();

  constructor(private chainConfigService: ChainConfigService) {}

  async onModuleInit() {
    await this.loadConfigsFromDatabase();
  }

  private async loadConfigsFromDatabase(): Promise<void> {
    try {
      const configs = await this.chainConfigService.findAll();

      for (const dbConfig of configs) {
        const interfaceConfig = this.chainConfigService.toInterface(dbConfig);
        this.chainConfigs.set(interfaceConfig.chainId, interfaceConfig);
      }
    } catch (error) {
      console.error('Failed to load chain configs from database:', error);
      // Fallback to empty configs - seeder should handle this
    }
  }

  async reloadConfigs(): Promise<void> {
    this.chainConfigs.clear();
    await this.loadConfigsFromDatabase();
  }

  getChainConfig(chainId: number): ChainConfig | undefined {
    return this.chainConfigs.get(chainId);
  }

  getAllChainConfigs(): ChainConfig[] {
    return Array.from(this.chainConfigs.values());
  }

  getEnabledChainConfigs(): ChainConfig[] {
    return this.getAllChainConfigs().filter((config) => config.enabled);
  }

  getChainsByType(type: ChainType): ChainConfig[] {
    return this.getAllChainConfigs().filter((config) => config.type === type);
  }

  getEnabledChainsByType(type: ChainType): ChainConfig[] {
    return this.getEnabledChainConfigs().filter(
      (config) => config.type === type,
    );
  }

  // Database operations
  async updateChainConfig(
    chainId: number,
    updates: Partial<ChainConfig>,
  ): Promise<void> {
    await this.chainConfigService.updateByChainId(chainId, updates);
    await this.reloadConfigs();
  }

  async toggleChainEnabled(chainId: number): Promise<void> {
    await this.chainConfigService.toggleEnabled(chainId);
    await this.reloadConfigs();
  }

  async updateStrategy(
    chainId: number,
    strategy: EventStrategy,
  ): Promise<void> {
    await this.chainConfigService.updateStrategy(chainId, strategy);
    await this.reloadConfigs();
  }
}
