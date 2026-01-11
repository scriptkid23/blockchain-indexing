import { Injectable, Logger } from '@nestjs/common';
import {
  BlockchainEvent,
  IEventHandler,
} from '../interfaces/blockchain.interface';

@Injectable()
export class EventDispatcherService {
  private readonly logger = new Logger(EventDispatcherService.name);
  private readonly handlers: IEventHandler[] = [];
  private readonly eventQueue: BlockchainEvent[] = [];
  private isProcessing = false;
  private readonly batchSize = 100; // Process events in batches
  private readonly batchTimeout = 50; // Max 50ms wait before processing batch

  registerHandler(handler: IEventHandler) {
    this.handlers.push(handler);
    this.logger.log(`Registered event handler: ${handler.constructor.name}`);
  }

  async dispatchEvent(event: BlockchainEvent): Promise<void> {
    this.logger.debug(
      `Received event: ${event.eventType} from chain ${event.chainId}`,
    );

    // Add to queue for processing
    this.eventQueue.push(event);

    // Process queue if not already processing
    if (!this.isProcessing) {
      await this.processEventQueue();
    }
  }

  async dispatchBatch(events: BlockchainEvent[]): Promise<void> {
    if (events.length === 0) return;

    this.logger.debug(
      `Received batch of ${events.length} events for processing`,
    );

    // Add all events to queue
    this.eventQueue.push(...events);

    // Process queue if not already processing
    if (!this.isProcessing) {
      await this.processEventQueue();
    }
  }

  private async processEventQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.eventQueue.length > 0) {
        // Collect batch of events
        const batch: BlockchainEvent[] = [];
        const startTime = Date.now();

        // Collect events up to batchSize or timeout
        while (
          batch.length < this.batchSize &&
          this.eventQueue.length > 0 &&
          Date.now() - startTime < this.batchTimeout
        ) {
          const event = this.eventQueue.shift();
          if (event) {
            batch.push(event);
          }
        }

        if (batch.length > 0) {
          await this.processBatch(batch);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processBatch(events: BlockchainEvent[]): Promise<void> {
    if (events.length === 0) return;

    this.logger.debug(
      `Processing batch of ${events.length} events`,
    );

    // Group events by handler
    const eventsByHandler = new Map<IEventHandler, BlockchainEvent[]>();

    for (const event of events) {
      for (const handler of this.handlers) {
        if (handler.canHandle(event)) {
          if (!eventsByHandler.has(handler)) {
            eventsByHandler.set(handler, []);
          }
          eventsByHandler.get(handler)!.push(event);
        }
      }
    }

    if (eventsByHandler.size === 0) {
      this.logger.warn(
        `No handlers found for batch of ${events.length} events`,
      );
      return;
    }

    // Process each handler's batch in parallel
    const promises = Array.from(eventsByHandler.entries()).map(
      async ([handler, handlerEvents]) => {
        try {
          await handler.handleBatch(handlerEvents);
          this.logger.debug(
            `Handler ${handler.constructor.name} processed ${handlerEvents.length} events successfully`,
          );
        } catch (error) {
          this.logger.error(
            `Handler ${handler.constructor.name} failed to process batch:`,
            error,
          );
        }
      },
    );

    await Promise.allSettled(promises);
  }

  getHandlerCount(): number {
    return this.handlers.length;
  }

  getQueueSize(): number {
    return this.eventQueue.length;
  }

  clearQueue(): void {
    this.eventQueue.length = 0;
    this.logger.log('Event queue cleared');
  }
}
