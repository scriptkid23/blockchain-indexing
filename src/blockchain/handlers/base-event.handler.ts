import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BlockchainEvent,
  IEventHandler,
} from '../interfaces/blockchain.interface';
import {
  BlockchainEvent as BlockchainEventDocument,
  BlockchainEventDocument as BlockchainEventDoc,
} from '../schemas/blockchain-event.schema';

@Injectable()
export abstract class BaseEventHandler implements IEventHandler {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    @InjectModel(BlockchainEventDocument.name)
    protected readonly blockchainEventModel: Model<BlockchainEventDoc>,
  ) {}

  /**
   * Handle a batch of events
   * This method automatically saves raw events to database, then calls processBatch for custom logic
   */
  async handleBatch(events: BlockchainEvent[]): Promise<void> {
    if (events.length === 0) return;

    try {
      // Automatically save raw events to database first
      await this.saveEventsToDatabase(events);

      // Call custom processing logic (can be overridden by child classes)
      await this.processBatch(events);
    } catch (error) {
      this.logger.error(
        `Error handling batch of ${events.length} events:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Save raw events to database without formatting
   */
  private async saveEventsToDatabase(events: BlockchainEvent[]): Promise<void> {
    try {
      // Convert BlockchainEvent interface to MongoDB document format
      const documents = events.map((event) => ({
        chainId: event.chainId,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        eventType: event.eventType,
        contractAddress: event.contractAddress,
        data: event.data, // Raw data, no formatting
        timestamp: event.timestamp,
        logIndex: event.data?.logIndex,
        transactionIndex: event.data?.transactionIndex,
        processed: false,
      }));

      // Bulk insert with error handling for duplicates
      try {
        await this.blockchainEventModel.insertMany(documents, {
          ordered: false, // Continue inserting even if some fail (duplicates)
        });
        this.logger.debug(
          `Saved ${documents.length} raw events to database`,
        );
      } catch (error: any) {
        // Handle duplicate key errors (expected when same event is processed twice)
        if (error.code === 11000) {
          const inserted = documents.length - (error.writeErrors?.length || 0);
          if (inserted > 0) {
            this.logger.debug(
              `Saved ${inserted} new events, ${documents.length - inserted} duplicates skipped`,
            );
          }
        } else {
          throw error;
        }
      }
    } catch (error) {
      this.logger.error('Error saving events to database:', error);
      // Don't throw - allow custom processing to continue even if save fails
    }
  }

  /**
   * Custom processing logic - override this in child classes
   * This is called after events are saved to database
   */
  protected async processBatch(events: BlockchainEvent[]): Promise<void> {
    // Default: do nothing, just log
    this.logger.debug(
      `Processed ${events.length} events (no custom logic implemented)`,
    );
  }

  /**
   * Check if this handler can handle a specific event
   * Must be implemented by child classes
   */
  abstract canHandle(event: BlockchainEvent): boolean;
}
