import { Injectable, Logger } from '@nestjs/common';
import { BlockchainEvent, IEventHandler } from '../interfaces/blockchain.interface';

@Injectable()
export class EventDispatcherService {
  private readonly logger = new Logger(EventDispatcherService.name);
  private readonly handlers: IEventHandler[] = [];
  private readonly eventQueue: BlockchainEvent[] = [];
  private isProcessing = false;

  registerHandler(handler: IEventHandler) {
    this.handlers.push(handler);
    this.logger.log(`Registered event handler: ${handler.constructor.name}`);
  }

  async dispatchEvent(event: BlockchainEvent): Promise<void> {
    this.logger.debug(`Received event: ${event.eventType} from chain ${event.chainId}`);
    
    // Add to queue for processing
    this.eventQueue.push(event);
    
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
        const event = this.eventQueue.shift();
        if (event) {
          await this.processEvent(event);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processEvent(event: BlockchainEvent): Promise<void> {
    const eligibleHandlers = this.handlers.filter(handler => handler.canHandle(event));
    
    if (eligibleHandlers.length === 0) {
      this.logger.warn(`No handlers found for event: ${event.eventType} from chain ${event.chainId}`);
      return;
    }

    this.logger.debug(`Processing event with ${eligibleHandlers.length} handlers`);

    // Process handlers in parallel
    const promises = eligibleHandlers.map(async (handler) => {
      try {
        await handler.handle(event);
        this.logger.debug(`Handler ${handler.constructor.name} processed event successfully`);
      } catch (error) {
        this.logger.error(`Handler ${handler.constructor.name} failed to process event:`, error);
      }
    });

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