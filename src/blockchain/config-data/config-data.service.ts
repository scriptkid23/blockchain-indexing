import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ChainConfigService } from '../services/chain-config.service';
import { ContractConfigService } from '../services/contract-config.service';
import { ChainConfig } from '../interfaces/blockchain.interface';
import { ContractConfig } from '../schemas/contract-config.schema';

@Injectable()
export class ConfigDataService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConfigDataService.name);
  
  // Cache for chain configs
  private chainConfigsCache: Map<number, ChainConfig> = new Map();
  private chainConfigsCacheTimestamp: number = 0;
  
  // Cache for contract configs by chain
  private contractsCache: Map<number, ContractConfig[]> = new Map();
  private contractsCacheTimestamp: Map<number, number> = new Map();
  
  // Refresh timer
  private refreshTimer: NodeJS.Timeout | null = null;
  private readonly refreshInterval: number;

  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly contractConfigService: ContractConfigService,
  ) {
    // Get refresh interval from env, default 30 seconds
    this.refreshInterval = parseInt(
      process.env.CONTRACT_REFRESH_INTERVAL || '30000',
      10,
    );
    
    this.logger.log(
      `ConfigDataService initialized with refresh interval: ${this.refreshInterval}ms`,
    );
  }

  async onModuleInit() {
    // Load initial data
    await this.loadChainConfigs();
    
    // Start refresh timer
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

  // Load chain configs from database
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

  // Load contract configs for a specific chain
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

  // Refresh all configs
  async refreshAll(): Promise<void> {
    await this.loadChainConfigs();
    // Refresh contracts for all cached chains
    const chainIds = Array.from(this.contractsCache.keys());
    await Promise.all(
      chainIds.map((chainId) => this.loadContractsForChain(chainId)),
    );
  }

  // Force refresh (can be called internally)
  async forceRefresh(): Promise<void> {
    this.logger.log('Force refreshing all config data...');
    await this.refreshAll();
    this.logger.log('Force refresh completed');
  }

  // Get enabled chain configs
  getEnabledChains(): ChainConfig[] {
    return Array.from(this.chainConfigsCache.values()).filter(
      (config) => config.enabled,
    );
  }

  // Get chain config by chainId
  getChainConfig(chainId: number): ChainConfig | undefined {
    return this.chainConfigsCache.get(chainId);
  }

  // Get enabled contracts for a chain (with caching)
  async getEnabledContractsByChain(chainId: number): Promise<ContractConfig[]> {
    // Check if we have cached data
    const cachedTimestamp = this.contractsCacheTimestamp.get(chainId);
    const now = Date.now();
    
    // If cache is missing or stale, reload
    if (
      !cachedTimestamp ||
      now - cachedTimestamp >= this.refreshInterval ||
      !this.contractsCache.has(chainId)
    ) {
      await this.loadContractsForChain(chainId);
    }
    
    // Return cached data (guaranteed to be fresh after load)
    return this.contractsCache.get(chainId) || [];
  }

  // Get cache statistics (for debugging)
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
