import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BlockchainEventDocument = BlockchainEvent & Document;

@Schema({ timestamps: true })
export class BlockchainEvent {
  @Prop({ required: true })
  chainId: number;

  @Prop({ required: true })
  blockNumber: number;

  @Prop({ required: true })
  transactionHash: string;

  @Prop({ required: true })
  eventType: string;

  @Prop({ required: true })
  contractAddress: string;

  @Prop({ type: Object, required: true })
  data: any;

  @Prop({ required: true })
  timestamp: number;

  @Prop()
  logIndex?: number;

  @Prop()
  transactionIndex?: number;

  @Prop({ default: false })
  processed: boolean;

  @Prop()
  processedAt?: Date;

  @Prop({ type: Object })
  processingResult?: any;
}

export const BlockchainEventSchema =
  SchemaFactory.createForClass(BlockchainEvent);

// Indexes for efficient queries
BlockchainEventSchema.index({ chainId: 1, blockNumber: 1 });
BlockchainEventSchema.index({ transactionHash: 1 });
BlockchainEventSchema.index({ contractAddress: 1, eventType: 1 });
BlockchainEventSchema.index({ processed: 1 });
BlockchainEventSchema.index({ timestamp: 1 });

// Unique constraint to prevent duplicate events
// Combination of transactionHash, logIndex, and chainId should be unique
BlockchainEventSchema.index(
  { 
    transactionHash: 1, 
    logIndex: 1, 
    chainId: 1 
  }, 
  { unique: true }
);
