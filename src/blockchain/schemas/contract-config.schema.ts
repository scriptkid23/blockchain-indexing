import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContractConfigDocument = ContractConfig & Document;

@Schema({ timestamps: true })
export class ContractConfig {
  @Prop({ required: true, lowercase: true })
  address: string;

  @Prop({ required: true })
  chainId: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  symbol: string;

  @Prop({ required: true })
  type: string; // 'erc20', 'erc721', 'erc1155', 'custom'

  @Prop({ type: [String], required: true })
  events: string[]; // Event signatures to monitor

  @Prop({ type: Object, required: true })
  abi: any; // ABI for the events we're monitoring

  @Prop({ default: true })
  enabled: boolean;

  @Prop()
  description?: string;

  @Prop({ type: Object })
  metadata?: any; // Additional contract metadata
}

export const ContractConfigSchema =
  SchemaFactory.createForClass(ContractConfig);

// Create compound index for address + chainId
ContractConfigSchema.index({ address: 1, chainId: 1 }, { unique: true });
ContractConfigSchema.index({ chainId: 1, enabled: 1 });
ContractConfigSchema.index({ type: 1, enabled: 1 });
