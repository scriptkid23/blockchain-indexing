import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ChainConfigService } from '../services/chain-config.service';
import { ContractConfigService } from '../services/contract-config.service';
import { ChainConfig } from '../interfaces/blockchain.interface';
import { ContractConfig } from '../schemas/contract-config.schema';

@Injectable()
export class ConfigCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConfigCacheService.name);

  private chainConfigsCache: Map<number, ChainConfig> = new Map();
  private chainConfigsCacheTimestamp: number = 0;

  private contractsCache: Map<number, ContractConfig[]> = new Map();
  private contractsCacheTimestamp: Map<number, number> = new Map();

  private refreshTimer: NodeJS.Timeout | null = null;
  private readonly refreshInterval: number;

  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly contractConfigService: ContractConfigService,
  ) {
    this.refreshInterval = parseInt(
      process.env.CONTRACT_REFRESH_INTERVAL || '30000',
      10,
    );

    this.logger.log(
      `ConfigCacheService initialized with refresh interval: ${this.refreshInterval}ms`,
    );
  }

  async onModuleInit() {
    await this.loadChainConfigs();
    this.startRefreshTimer();
  }

  async onModuleDestroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private startRefreshTimer(): void {
    this.refreshTimer = setInterval(async () => {
      try {
        await this.refreshAll();
        this.logger.debug('Refreshed all config data from database');
      } catch (error) {
        this.logger.error('Error refreshing config data:', error);
      }
    }, this.refreshInterval);
  }

  private async loadChainConfigs(): Promise<void> {
    try {
      const configs = await this.chainConfigService.findAll();

      this.chainConfigsCache.clear();
      for (const dbConfig of configs) {
        const interfaceConfig = this.chainConfigService.toInterface(dbConfig);
        this.chainConfigsCache.set(interfaceConfig.chainId, interfaceConfig);
      }

      this.chainConfigsCacheTimestamp = Date.now();

      this.logger.debug(
        `Loaded ${this.chainConfigsCache.size} chain configs into cache`,
      );
    } catch (error) {
      this.logger.error('Error loading chain configs:', error);
      throw error;
    }
  }

  private async loadContractsForChain(chainId: number): Promise<void> {
    try {
      const contracts =
        await this.contractConfigService.getEnabledContractsByChain(chainId);

      this.contractsCache.set(chainId, contracts);
      this.contractsCacheTimestamp.set(chainId, Date.now());

      this.logger.debug(
        `Loaded ${contracts.length} enabled contracts for chain ${chainId} into cache`,
      );
    } catch (error) {
      this.logger.error(
        `Error loading contracts for chain ${chainId}:`,
        error,
      );
      throw error;
    }
  }

  async refreshAll(): Promise<void> {
    await this.loadChainConfigs();
    const chainIds = Array.from(this.contractsCache.keys());
    await Promise.all(
      chainIds.map((chainId) => this.loadContractsForChain(chainId)),
    );
  }

  async forceRefresh(): Promise<void> {
    this.logger.log('Force refreshing all config data...');
    await this.refreshAll();
    this.logger.log('Force refresh completed');
  }

  getEnabledChains(): ChainConfig[] {
    return Array.from(this.chainConfigsCache.values()).filter(
      (config) => config.enabled,
    );
  }

  getChainConfig(chainId: number): ChainConfig | undefined {
    return this.chainConfigsCache.get(chainId);
  }

  async getEnabledContractsByChain(chainId: number): Promise<ContractConfig[]> {
    const cachedTimestamp = this.contractsCacheTimestamp.get(chainId);
    const now = Date.now();

    if (
      !cachedTimestamp ||
      now - cachedTimestamp >= this.refreshInterval ||
      !this.contractsCache.has(chainId)
    ) {
      await this.loadContractsForChain(chainId);
    }

    return this.contractsCache.get(chainId) || [];
  }

  getCacheStats() {
    return {
      chainConfigsCount: this.chainConfigsCache.size,
      chainConfigsLastUpdated: new Date(
        this.chainConfigsCacheTimestamp,
      ).toISOString(),
      contractsCacheCount: this.contractsCache.size,
      contractsByChain: Array.from(this.contractsCache.entries()).map(
        ([chainId, contracts]) => ({
          chainId,
          count: contracts.length,
          lastUpdated: new Date(
            this.contractsCacheTimestamp.get(chainId) || 0,
          ).toISOString(),
        }),
      ),
      refreshInterval: this.refreshInterval,
    };
  }
}
