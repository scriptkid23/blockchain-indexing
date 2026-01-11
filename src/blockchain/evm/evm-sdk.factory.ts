import { Injectable } from '@nestjs/common';
import { EvmSdkService } from './evm-sdk.service';
import { BlockchainConfigService } from '../config/blockchain.config';
import { EventDispatcherService } from '../core/event-dispatcher.service';
import { ContractConfigService } from '../services/contract-config.service';
import { ConfigCacheService } from '../config-data/config-cache.service';

@Injectable()
export class EvmSdkFactory {
  constructor(
    private readonly configService: BlockchainConfigService,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly contractConfigService: ContractConfigService,
    private readonly configCacheService: ConfigCacheService,
  ) {}

  create(chainId: number): EvmSdkService {
    return new EvmSdkService(
      chainId,
      this.configService,
      this.eventDispatcher,
      this.contractConfigService,
      this.configCacheService,
    );
  }
}
