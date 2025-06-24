import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ChainConfig,
  ChainConfigDocument,
} from '../schemas/chain-config.schema';
import { ChainType, EventStrategy } from '../interfaces/blockchain.interface';

@Injectable()
export class ChainConfigService {
  constructor(
    @InjectModel(ChainConfig.name)
    private chainConfigModel: Model<ChainConfigDocument>,
  ) {}

  async findAll(): Promise<ChainConfig[]> {
    return this.chainConfigModel.find().exec();
  }

  async findEnabled(): Promise<ChainConfig[]> {
    return this.chainConfigModel.find({ enabled: true }).exec();
  }

  async findByChainId(chainId: number): Promise<ChainConfig | null> {
    return this.chainConfigModel.findOne({ chainId }).exec();
  }

  async findByType(type: string): Promise<ChainConfig[]> {
    return this.chainConfigModel.find({ type }).exec();
  }

  async findEnabledByType(type: string): Promise<ChainConfig[]> {
    return this.chainConfigModel.find({ type, enabled: true }).exec();
  }

  async create(chainConfig: Partial<ChainConfig>): Promise<ChainConfig> {
    const createdConfig = new this.chainConfigModel(chainConfig);
    return createdConfig.save();
  }

  async updateByChainId(
    chainId: number,
    updateData: Partial<ChainConfig>,
  ): Promise<ChainConfig | null> {
    return this.chainConfigModel
      .findOneAndUpdate({ chainId }, updateData, { new: true })
      .exec();
  }

  async updateStrategy(
    chainId: number,
    strategy: string,
  ): Promise<ChainConfig | null> {
    return this.chainConfigModel
      .findOneAndUpdate({ chainId }, { strategy }, { new: true })
      .exec();
  }

  async toggleEnabled(chainId: number): Promise<ChainConfig | null> {
    const config = await this.findByChainId(chainId);
    if (!config) return null;

    return this.chainConfigModel
      .findOneAndUpdate(
        { chainId },
        { enabled: !config.enabled },
        { new: true },
      )
      .exec();
  }

  async deleteByChainId(chainId: number): Promise<boolean> {
    const result = await this.chainConfigModel.deleteOne({ chainId }).exec();
    return result.deletedCount > 0;
  }

  // Convert database model to interface format
  toInterface(dbConfig: ChainConfig): any {
    return {
      chainId: dbConfig.chainId,
      name: dbConfig.name,
      type: dbConfig.type as ChainType,
      rpcUrl: dbConfig.rpcUrl,
      wsUrl: dbConfig.wsUrl,
      strategy: dbConfig.strategy as EventStrategy,
      scanInterval: dbConfig.scanInterval,
      enabled: dbConfig.enabled,
    };
  }
}
