import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChainConfigDocument = ChainConfig & Document;

@Schema({ timestamps: true })
export class ChainConfig {
  @Prop({ required: true, unique: true })
  chainId: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  symbol: string;

  @Prop({ required: true, enum: ['evm', 'solana', 'sui'] })
  type: string;

  @Prop({ required: true })
  rpcUrl: string;

  @Prop()
  wsUrl?: string;

  @Prop({ required: true, enum: ['websocket', 'block_scan', 'hybrid'] })
  strategy: string;

  @Prop({ default: 5000 })
  scanInterval?: number;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: false })
  isTestnet: boolean;

  @Prop()
  explorerUrl?: string;

  @Prop()
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };

  @Prop({ type: Object })
  metadata?: any;
}

export const ChainConfigSchema = SchemaFactory.createForClass(ChainConfig);
