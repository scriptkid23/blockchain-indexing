import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ContractData,
  ContractDataDocument,
} from '../schemas/contract-data.schema';

@Injectable()
export class ContractDataService {
  constructor(
    @InjectModel(ContractData.name)
    private contractDataModel: Model<ContractDataDocument>,
  ) {}

  async create(contractData: Partial<ContractData>): Promise<ContractData> {
    // Generate collection key based on contract type and chain ID
    const collectionKey = this.generateCollectionKey(
      contractData.contractType!,
      contractData.chainId!,
    );

    const createdContract = new this.contractDataModel({
      ...contractData,
      collectionKey,
      lastUpdated: new Date(),
    });

    return createdContract.save();
  }

  async findByAddress(
    contractAddress: string,
    chainId: number,
  ): Promise<ContractData | null> {
    return this.contractDataModel.findOne({ contractAddress, chainId }).exec();
  }

  async findByCollectionKey(collectionKey: string): Promise<ContractData[]> {
    return this.contractDataModel
      .find({ collectionKey, isActive: true })
      .exec();
  }

  async findByTypeAndChain(
    contractType: string,
    chainId: number,
  ): Promise<ContractData[]> {
    return this.contractDataModel
      .find({
        contractType,
        chainId,
        isActive: true,
      })
      .exec();
  }

  async updateContract(
    contractAddress: string,
    chainId: number,
    updateData: Partial<ContractData>,
  ): Promise<ContractData | null> {
    return this.contractDataModel
      .findOneAndUpdate(
        { contractAddress, chainId },
        {
          ...updateData,
          lastUpdated: new Date(),
        },
        { new: true },
      )
      .exec();
  }

  async upsertContract(
    contractData: Partial<ContractData>,
  ): Promise<ContractData> {
    const collectionKey = this.generateCollectionKey(
      contractData.contractType!,
      contractData.chainId!,
    );

    return this.contractDataModel
      .findOneAndUpdate(
        {
          contractAddress: contractData.contractAddress,
          chainId: contractData.chainId,
        },
        {
          ...contractData,
          collectionKey,
          lastUpdated: new Date(),
        },
        {
          new: true,
          upsert: true,
        },
      )
      .exec();
  }

  async deactivateContract(
    contractAddress: string,
    chainId: number,
  ): Promise<ContractData | null> {
    return this.contractDataModel
      .findOneAndUpdate(
        { contractAddress, chainId },
        { isActive: false, lastUpdated: new Date() },
        { new: true },
      )
      .exec();
  }

  async getContractsByChain(chainId: number): Promise<ContractData[]> {
    return this.contractDataModel.find({ chainId, isActive: true }).exec();
  }

  async getAllERC20Contracts(): Promise<ContractData[]> {
    return this.contractDataModel
      .find({
        contractType: 'erc20',
        isActive: true,
      })
      .exec();
  }

  async getContractStats(chainId?: number) {
    const matchCondition = chainId
      ? { chainId, isActive: true }
      : { isActive: true };

    return this.contractDataModel
      .aggregate([
        { $match: matchCondition },
        {
          $group: {
            _id: '$contractType',
            count: { $sum: 1 },
            chains: { $addToSet: '$chainId' },
          },
        },
        {
          $project: {
            contractType: '$_id',
            count: 1,
            chainCount: { $size: '$chains' },
            _id: 0,
          },
        },
      ])
      .exec();
  }

  private generateCollectionKey(contractType: string, chainId: number): string {
    return `${contractType}_${chainId}`;
  }

  // Helper method for ERC20 specific operations
  async saveERC20Data(
    contractAddress: string,
    chainId: number,
    tokenData: {
      name: string;
      symbol: string;
      decimals: number;
      totalSupply?: string;
      owner?: string;
    },
  ): Promise<ContractData> {
    return this.upsertContract({
      contractAddress,
      chainId,
      contractType: 'erc20',
      name: tokenData.name,
      symbol: tokenData.symbol,
      decimals: tokenData.decimals,
      totalSupply: tokenData.totalSupply,
      owner: tokenData.owner,
      metadata: {
        tokenType: 'ERC20',
        ...tokenData,
      },
    });
  }
}
