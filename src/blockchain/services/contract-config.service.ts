import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ContractConfig,
  ContractConfigDocument,
} from '../schemas/contract-config.schema';

export interface CreateContractConfigDto {
  address: string;
  chainId: number;
  name: string;
  symbol: string;
  type: string;
  events: string[];
  abi: any;
  enabled?: boolean;
  description?: string;
  metadata?: any;
}

@Injectable()
export class ContractConfigService {
  private readonly logger = new Logger(ContractConfigService.name);

  constructor(
    @InjectModel(ContractConfig.name)
    private contractConfigModel: Model<ContractConfigDocument>,
  ) {}

  async create(
    contractConfig: CreateContractConfigDto,
  ): Promise<ContractConfig> {
    const config = new this.contractConfigModel({
      ...contractConfig,
      address: contractConfig.address.toLowerCase(),
    });

    const saved = await config.save();
    this.logger.log(
      `Created contract config: ${contractConfig.name} (${contractConfig.address})`,
    );
    return saved;
  }

  async findAll(): Promise<ContractConfig[]> {
    return this.contractConfigModel.find().exec();
  }

  async findByChainId(chainId: number): Promise<ContractConfig[]> {
    return await this.contractConfigModel.find({ chainId }).exec();
  }

  async findByAddress(
    address: string,
    chainId: number,
  ): Promise<ContractConfig | null> {
    return this.contractConfigModel
      .findOne({
        address: address.toLowerCase(),
        chainId,
      })
      .exec();
  }

  async findBySymbol(symbol: string): Promise<ContractConfig[]> {
    return await this.contractConfigModel
      .find({ symbol: symbol.toUpperCase() })
      .exec();
  }

  async findByType(type: string): Promise<ContractConfig[]> {
    return await this.contractConfigModel.find({ type }).exec();
  }

  async findEnabledBySymbol(symbol: string): Promise<ContractConfig[]> {
    return await this.contractConfigModel
      .find({ symbol: symbol.toUpperCase(), enabled: true })
      .exec();
  }

  async getMultiChainContracts(): Promise<{
    symbol: string;
    deployments: { chainId: number; address: string; enabled: boolean }[];
  }[]> {
    const contracts = await this.contractConfigModel.find().exec();
    
    // Group by symbol
    const grouped = contracts.reduce((acc, contract) => {
      if (!acc[contract.symbol]) {
        acc[contract.symbol] = [];
      }
      acc[contract.symbol].push({
        chainId: contract.chainId,
        address: contract.address,
        enabled: contract.enabled,
      });
      return acc;
    }, {} as Record<string, { chainId: number; address: string; enabled: boolean }[]>);

    return Object.entries(grouped).map(([symbol, deployments]) => ({
      symbol,
      deployments,
    }));
  }

  async updateEnabled(
    address: string,
    chainId: number,
    enabled: boolean,
  ): Promise<ContractConfig | null> {
    const updated = await this.contractConfigModel
      .findOneAndUpdate(
        { address: address.toLowerCase(), chainId },
        { enabled },
        { new: true },
      )
      .exec();

    if (updated) {
      this.logger.log(
        `Updated contract ${address} enabled status to ${enabled}`,
      );
    }

    return updated;
  }

  async delete(address: string, chainId: number): Promise<boolean> {
    const result = await this.contractConfigModel
      .deleteOne({
        address: address.toLowerCase(),
        chainId,
      })
      .exec();

    if (result.deletedCount > 0) {
      this.logger.log(`Deleted contract config: ${address}`);
      return true;
    }

    return false;
  }

  async getEnabledContractsByChain(chainId: number): Promise<ContractConfig[]> {
    return this.contractConfigModel
      .find({
        chainId,
        enabled: true,
      })
      .exec();
  }

  // Helper method to get contracts that monitor specific events
  async getContractsWithEvent(
    eventSignature: string,
    chainId?: number,
  ): Promise<ContractConfig[]> {
    const query: any = {
      events: eventSignature,
      enabled: true,
    };
    if (chainId) {
      query.chainId = chainId;
    }
    return this.contractConfigModel.find(query).exec();
  }

  // Bulk create contracts (useful for seeding)
  async createMany(contracts: CreateContractConfigDto[]): Promise<any[]> {
    const configs = contracts.map((contract) => ({
      ...contract,
      address: contract.address.toLowerCase(),
    }));

    const created = await this.contractConfigModel.insertMany(configs);
    this.logger.log(`Created ${created.length} contract configs`);
    return created;
  }
}
