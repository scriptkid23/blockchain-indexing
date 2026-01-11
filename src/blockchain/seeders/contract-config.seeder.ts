import { Injectable, Logger } from '@nestjs/common';
import {
  ContractConfigService,
  CreateContractConfigDto,
} from '../services/contract-config.service';
import { AbiUtils } from '../evm/utils/abi-utils';
import * as seedData from './test.seed.json';

@Injectable()
export class ContractConfigSeeder {
  private readonly logger = new Logger(ContractConfigSeeder.name);

  constructor(private readonly contractConfigService: ContractConfigService) {}

  async seed(): Promise<void> {
    this.logger.log('Starting contract config seeding...');

    const contracts = this.getContractConfigs();

    for (const contractConfig of contracts) {
      try {
        const existing = await this.contractConfigService.findByAddress(
          contractConfig.address,
          contractConfig.chainId,
        );

        if (!existing) {
          await this.contractConfigService.create(contractConfig);
          this.logger.log(
            `✅ Created: ${contractConfig.symbol} on chain ${contractConfig.chainId} (${contractConfig.address})`,
          );
        } else {
          this.logger.log(
            `⏭️  Already exists: ${contractConfig.symbol} on chain ${contractConfig.chainId} - skipping`,
          );
        }
      } catch (error) {
        this.logger.error(
          `❌ Error processing ${contractConfig.symbol} on chain ${contractConfig.chainId}:`,
          error,
        );
      }
    }

    this.logger.log('Contract config seeding completed');
  }

  private getContractConfigs(): CreateContractConfigDto[] {
    const contracts = (seedData as any).contracts || [];

    return contracts.map((contract: any) => {
      const eventDeclarations = contract.events || [];
      const eventSignatures = eventDeclarations.map((event) =>
        AbiUtils.getEventSignatureFromDeclaration(event),
      );

      return {
        ...contract,
        events: eventSignatures,
      };
    });
  }
}
