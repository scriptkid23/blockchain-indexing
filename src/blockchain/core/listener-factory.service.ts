import { Injectable, Logger } from '@nestjs/common';
import { 
  IBlockchainListener, 
  EventStrategy, 
  IBlockchainSDK 
} from '../interfaces/blockchain.interface';
import { EventDispatcherService } from './event-dispatcher.service';

@Injectable()
export class ListenerFactoryService {
  private readonly logger = new Logger(ListenerFactoryService.name);
  private readonly activeListeners: Map<string, IBlockchainListener> = new Map();

  constructor(private readonly eventDispatcher: EventDispatcherService) {}

  async createListener(
    sdk: IBlockchainSDK, 
    strategy: EventStrategy
  ): Promise<IBlockchainListener> {
    const listenerKey = `${sdk.chainId}-${strategy}`;
    
    // Return existing listener if already created
    if (this.activeListeners.has(listenerKey)) {
      const existingListener = this.activeListeners.get(listenerKey)!;
      this.logger.log(`Returning existing listener for chain ${sdk.chainId} with strategy ${strategy}`);
      return existingListener;
    }

    try {
      const listener = sdk.createListener(strategy);
      this.activeListeners.set(listenerKey, listener);
      
      this.logger.log(`Created ${strategy} listener for chain ${sdk.chainId}`);
      return listener;
    } catch (error) {
      this.logger.error(`Failed to create listener for chain ${sdk.chainId}:`, error);
      throw error;
    }
  }

  async startListener(sdk: IBlockchainSDK, strategy: EventStrategy): Promise<void> {
    const listener = await this.createListener(sdk, strategy);
    
    if (listener.isRunning()) {
      this.logger.warn(`Listener for chain ${sdk.chainId} is already running`);
      return;
    }

    try {
      await listener.start();
      this.logger.log(`Started ${strategy} listener for chain ${sdk.chainId}`);
    } catch (error) {
      this.logger.error(`Failed to start listener for chain ${sdk.chainId}:`, error);
      throw error;
    }
  }

  async stopListener(chainId: number, strategy: EventStrategy): Promise<void> {
    const listenerKey = `${chainId}-${strategy}`;
    const listener = this.activeListeners.get(listenerKey);
    
    if (!listener) {
      this.logger.warn(`No listener found for chain ${chainId} with strategy ${strategy}`);
      return;
    }

    if (!listener.isRunning()) {
      this.logger.warn(`Listener for chain ${chainId} is not running`);
      return;
    }

    try {
      await listener.stop();
      this.logger.log(`Stopped ${strategy} listener for chain ${chainId}`);
    } catch (error) {
      this.logger.error(`Failed to stop listener for chain ${chainId}:`, error);
      throw error;
    }
  }

  async stopAllListeners(): Promise<void> {
    this.logger.log('Stopping all listeners...');
    
    const stopPromises = Array.from(this.activeListeners.entries()).map(
      async ([key, listener]) => {
        try {
          if (listener.isRunning()) {
            await listener.stop();
            this.logger.log(`Stopped listener: ${key}`);
          }
        } catch (error) {
          this.logger.error(`Failed to stop listener ${key}:`, error);
        }
      }
    );

    await Promise.allSettled(stopPromises);
    this.activeListeners.clear();
    this.logger.log('All listeners stopped');
  }

  getActiveListeners(): Array<{ key: string; isRunning: boolean }> {
    return Array.from(this.activeListeners.entries()).map(([key, listener]) => ({
      key,
      isRunning: listener.isRunning(),
    }));
  }

  getRunningListenersCount(): number {
    return Array.from(this.activeListeners.values()).filter(listener => 
      listener.isRunning()
    ).length;
  }

  isListenerRunning(chainId: number, strategy: EventStrategy): boolean {
    const listenerKey = `${chainId}-${strategy}`;
    const listener = this.activeListeners.get(listenerKey);
    return listener ? listener.isRunning() : false;
  }
} 