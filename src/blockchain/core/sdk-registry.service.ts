import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IBlockchainSDK, ChainType } from '../interfaces/blockchain.interface';
import { BlockchainConfigService } from '../config/blockchain.config';

@Injectable()
export class SdkRegistryService implements OnModuleInit {
  private readonly logger = new Logger(SdkRegistryService.name);
  private readonly sdks: Map<number, IBlockchainSDK> = new Map();
  private readonly factories: Map<
    ChainType,
    (chainId: number) => Promise<IBlockchainSDK>
  > = new Map();

  constructor(private readonly configService: BlockchainConfigService) {}

  async onModuleInit() {
    await this.initializeSDKs();
  }

  registerSDKFactory(
    chainType: ChainType,
    factory: (chainId: number) => Promise<IBlockchainSDK>,
  ) {
    this.factories.set(chainType, factory);
    this.logger.log(`Registered SDK factory for chain type: ${chainType}`);
  }

  async getSDK(chainId: number): Promise<IBlockchainSDK | undefined> {
    // Return existing SDK if already created
    if (this.sdks.has(chainId)) {
      return this.sdks.get(chainId);
    }

    // Create new SDK if factory exists
    const chainConfig = this.configService.getChainConfig(chainId);
    if (!chainConfig || !chainConfig.enabled) {
      this.logger.warn(`Chain ${chainId} is not configured or disabled`);
      return undefined;
    }

    const factory = this.factories.get(chainConfig.type);
    if (!factory) {
      this.logger.error(
        `No factory registered for chain type: ${chainConfig.type}`,
      );
      return undefined;
    }

    try {
      const sdk = await factory(chainId);
      await sdk.connect();
      this.sdks.set(chainId, sdk);
      this.logger.log(
        `Created and connected SDK for chain ${chainId} (${chainConfig.name})`,
      );
      return sdk;
    } catch (error) {
      this.logger.error(`Failed to create SDK for chain ${chainId}:`, error);
      return undefined;
    }
  }

  async getSDKsByType(chainType: ChainType): Promise<IBlockchainSDK[]> {
    const configs = this.configService.getEnabledChainsByType(chainType);
    const sdks: IBlockchainSDK[] = [];

    for (const config of configs) {
      const sdk = await this.getSDK(config.chainId);
      if (sdk) {
        sdks.push(sdk);
      }
    }

    return sdks;
  }

  getAllSDKs(): IBlockchainSDK[] {
    return Array.from(this.sdks.values());
  }

  async disconnectAll(): Promise<void> {
    this.logger.log('Disconnecting all SDKs...');

    for (const [chainId, sdk] of this.sdks) {
      try {
        await sdk.disconnect();
        this.logger.log(`Disconnected SDK for chain ${chainId}`);
      } catch (error) {
        this.logger.error(
          `Failed to disconnect SDK for chain ${chainId}:`,
          error,
        );
      }
    }

    this.sdks.clear();
  }

  private async initializeSDKs(): Promise<void> {
    this.logger.log('Initializing SDK Registry...');

    // SDKs will be created on-demand when requested
    // This allows for lazy loading and better error handling

    this.logger.log('SDK Registry initialized');
  }

  getRegisteredChainTypes(): ChainType[] {
    return Array.from(this.factories.keys());
  }

  isChainSupported(chainId: number): boolean {
    const config = this.configService.getChainConfig(chainId);
    if (!config) return false;

    return this.factories.has(config.type) && config.enabled;
  }
}
