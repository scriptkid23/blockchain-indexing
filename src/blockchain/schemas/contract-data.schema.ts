import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContractDataDocument = ContractData & Document;

@Schema({ timestamps: true })
export class ContractData {
  @Prop({ required: true })
  contractAddress: string;

  @Prop({ required: true })
  chainId: number;

  @Prop({ required: true })
  contractType: string; // 'erc20', 'erc721', 'erc1155', etc.

  @Prop({ required: true })
  collectionKey: string; // Format: erc20_1, erc721_56, etc.

  @Prop({ type: Object })
  metadata: any; // Contract specific data

  @Prop()
  name?: string;

  @Prop()
  symbol?: string;

  @Prop()
  decimals?: number;

  @Prop()
  totalSupply?: string;

  @Prop()
  owner?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastUpdated: Date;

  @Prop({ type: Object })
  abi?: any[];

  // Block tracking for event processing
  @Prop()
  lastProcessedBlock?: number;

  @Prop()
  firstSeenBlock?: number;

  @Prop()
  startFromBlock?: number; // User-defined start block for processing
}

export const ContractDataSchema = SchemaFactory.createForClass(ContractData);

// Index for efficient queries
ContractDataSchema.index({ contractAddress: 1, chainId: 1 }, { unique: true });
ContractDataSchema.index({ collectionKey: 1 });
ContractDataSchema.index({ contractType: 1, chainId: 1 });
