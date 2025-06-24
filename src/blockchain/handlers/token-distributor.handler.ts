import { Injectable, Logger } from '@nestjs/common';
import { BlockchainEvent, IEventHandler } from '../interfaces/blockchain.interface';

@Injectable()
export class TokenDistributorHandler implements IEventHandler {
  private readonly logger = new Logger(TokenDistributorHandler.name);

  async handle(event: BlockchainEvent): Promise<void> {
    this.logger.log(`Processing TokenDistributor event: ${event.eventType} from chain ${event.chainId}`);
    
    try {
      switch (event.eventType) {
        case 'contract_log':
          await this.handleContractLog(event);
          break;
        case 'transaction':
          await this.handleTransaction(event);
          break;
        default:
          this.logger.debug(`Unhandled event type: ${event.eventType}`);
      }
    } catch (error) {
      this.logger.error(`Error handling TokenDistributor event:`, error);
      throw error;
    }
  }

  canHandle(event: BlockchainEvent): boolean {
    // Example: Handle events from specific contract addresses
    const tokenDistributorAddresses = [
      '0x742d35Cc66672e6E38b3F8C1e1D52473c5a4e8f5', // Example Ethereum address
      '0x123...', // Add more contract addresses
    ];

    return tokenDistributorAddresses.includes(event.contractAddress.toLowerCase()) ||
           event.eventType === 'token_distribution';
  }

  private async handleContractLog(event: BlockchainEvent): Promise<void> {
    const { data } = event;
    
    // Parse contract logs based on event signatures
    if (data.topics && data.topics.length > 0) {
      const eventSignature = data.topics[0];
      
      switch (eventSignature) {
        case '0x123...': // Example: TokensDistributed event signature
          await this.handleTokensDistributed(event);
          break;
        case '0x456...': // Example: AllocationUpdated event signature
          await this.handleAllocationUpdated(event);
          break;
        default:
          this.logger.debug(`Unknown event signature: ${eventSignature}`);
      }
    }
  }

  private async handleTransaction(event: BlockchainEvent): Promise<void> {
    const { data } = event;
    
    // Handle general transaction events
    this.logger.debug(`Transaction from ${data.from} to ${data.to} with value ${data.value}`);
    
    // Store transaction data, update balances, etc.
    // await this.storeTransaction(event);
  }

  private async handleTokensDistributed(event: BlockchainEvent): Promise<void> {
    this.logger.log(`Tokens distributed in transaction ${event.transactionHash}`);
    
    // Parse event data and extract relevant information
    // const decodedData = this.decodeTokensDistributedEvent(event.data);
    
    // Store distribution data, update user balances, etc.
    // await this.storeTokenDistribution(decodedData);
  }

  private async handleAllocationUpdated(event: BlockchainEvent): Promise<void> {
    this.logger.log(`Allocation updated in transaction ${event.transactionHash}`);
    
    // Parse event data and update allocations
    // const decodedData = this.decodeAllocationUpdatedEvent(event.data);
    
    // Update allocation records
    // await this.updateAllocation(decodedData);
  }
} 