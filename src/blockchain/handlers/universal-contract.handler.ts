import { Injectable, Logger } from '@nestjs/common';
import {
  BlockchainEvent,
  IEventHandler,
} from '../interfaces/blockchain.interface';
import { ContractConfigService } from '../services/contract-config.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BlockchainEvent as BlockchainEventDocument,
  BlockchainEventDocument as BlockchainEventDoc,
} from '../schemas/blockchain-event.schema';

@Injectable()
export class UniversalContractHandler implements IEventHandler {
  private readonly logger = new Logger(UniversalContractHandler.name);

  constructor(
    private readonly contractConfigService: ContractConfigService,
    @InjectModel(BlockchainEventDocument.name)
    private blockchainEventModel: Model<BlockchainEventDoc>,
  ) {}

  async handle(event: BlockchainEvent): Promise<void> {
    try {
      // Get contract config to understand what we're dealing with
      const contractConfig = await this.contractConfigService.findByAddress(
        event.contractAddress,
        event.chainId,
      );

      if (!contractConfig) {
        this.logger.debug(
          `No contract config found for ${event.contractAddress} on chain ${event.chainId}`,
        );
        return;
      }

      // Enhanced processing based on contract type and event
      await this.processContractEvent(event, contractConfig);

      // Save to database for historical analysis
      await this.saveEvent(event, contractConfig);
    } catch (error) {
      this.logger.error(`Error handling contract event:`, error);
      throw error;
    }
  }

  canHandle(event: BlockchainEvent): boolean {
    // Handle all contract_log events (we'll filter by contract config inside)
    return event.eventType === 'contract_log' && !!event.contractAddress;
  }

  private async processContractEvent(
    event: BlockchainEvent,
    contractConfig: any,
  ): Promise<void> {
    const eventData = event.data?.event;
    if (!eventData) return;

    const { name: eventName, args } = eventData;

    // Log based on contract type and priority
    const logLevel = this.getLogLevel(contractConfig, eventName, args);
    const message = this.formatEventMessage(
      contractConfig,
      eventName,
      args,
      event,
    );

    switch (logLevel) {
      case 'high':
        this.logger.log(`🚨 HIGH PRIORITY: ${message}`);
        break;
      case 'medium':
        this.logger.log(`⚠️ MEDIUM: ${message}`);
        break;
      case 'low':
        this.logger.debug(`ℹ️ ${message}`);
        break;
      default:
        this.logger.debug(message);
    }

    // Special processing for different event types
    if (eventName === 'Transfer') {
      await this.processTransferEvent(event, contractConfig, args);
    } else if (eventName === 'Approval') {
      await this.processApprovalEvent(event, contractConfig, args);
    }

    // Custom processing based on contract type
    if (contractConfig.type === 'erc20') {
      await this.processERC20Event(event, contractConfig, eventName, args);
    } else if (contractConfig.type === 'erc721') {
      await this.processERC721Event(event, contractConfig, eventName, args);
    }
  }

  private getLogLevel(
    contractConfig: any,
    eventName: string,
    args: any,
  ): 'high' | 'medium' | 'low' {
    // High priority for large transfers on high-priority contracts
    if (contractConfig.metadata?.priority === 'high') {
      if (eventName === 'Transfer' && args?.isLargeTransfer) {
        return 'high';
      }
      return 'medium';
    }

    // Medium priority for stablecoins
    if (contractConfig.metadata?.isStablecoin && eventName === 'Transfer') {
      return args?.isLargeTransfer ? 'high' : 'medium';
    }

    // Low priority for others
    return 'low';
  }

  private formatEventMessage(
    contractConfig: any,
    eventName: string,
    args: any,
    event: BlockchainEvent,
  ): string {
    const symbol = contractConfig.symbol;
    const txHash = event.transactionHash.slice(0, 10) + '...';

    if (eventName === 'Transfer' && args) {
      const from = args.from.slice(0, 6) + '...';
      const to = args.to.slice(0, 6) + '...';
      const amount = args.valueFormatted || args.value;
      return `${symbol} Transfer: ${from} → ${to} | ${amount} ${symbol} | ${txHash}`;
    }

    if (eventName === 'Approval' && args) {
      const owner = args.owner.slice(0, 6) + '...';
      const spender = args.spender.slice(0, 6) + '...';
      const amount = args.valueFormatted || args.value;
      return `${symbol} Approval: ${owner} approved ${spender} for ${amount} ${symbol} | ${txHash}`;
    }

    return `${symbol} ${eventName} | Block ${event.blockNumber} | ${txHash}`;
  }

  private async processTransferEvent(
    event: BlockchainEvent,
    contractConfig: any,
    args: any,
  ): Promise<void> {
    // Extract transfer details
    const transferData = {
      from: args.from,
      to: args.to,
      value: args.value,
      valueFormatted: args.valueFormatted,
      isLargeTransfer: args.isLargeTransfer,
    };

    // Whale alert for large transfers
    if (transferData.isLargeTransfer) {
      this.logger.warn(
        `🐋 WHALE ALERT: Large ${contractConfig.symbol} transfer detected!`,
      );
      // Here you could send notifications, webhooks, etc.
    }

    // Track zero address (mint/burn)
    if (transferData.from === '0x0000000000000000000000000000000000000000') {
      this.logger.log(
        `🟢 MINT: ${transferData.valueFormatted} ${contractConfig.symbol} minted to ${transferData.to}`,
      );
    } else if (
      transferData.to === '0x0000000000000000000000000000000000000000'
    ) {
      this.logger.log(
        `🔥 BURN: ${transferData.valueFormatted} ${contractConfig.symbol} burned from ${transferData.from}`,
      );
    }

    // Add additional analysis here (volume tracking, pattern detection, etc.)
  }

  private async processApprovalEvent(
    event: BlockchainEvent,
    contractConfig: any,
    args: any,
  ): Promise<void> {
    const approvalData = {
      owner: args.owner,
      spender: args.spender,
      value: args.value,
      valueFormatted: args.valueFormatted,
    };

    // Log high-value approvals
    if (args.isLargeTransfer) {
      this.logger.warn(
        `💳 Large ${contractConfig.symbol} approval: ${approvalData.valueFormatted} ${contractConfig.symbol}`,
      );
    }
  }

  private async processERC20Event(
    event: BlockchainEvent,
    contractConfig: any,
    eventName: string,
    args: any,
  ): Promise<void> {
    // ERC-20 specific processing
    // Track supply changes, volume, etc.
  }

  private async processERC721Event(
    event: BlockchainEvent,
    contractConfig: any,
    eventName: string,
    args: any,
  ): Promise<void> {
    // NFT specific processing
    // Track mints, sales, etc.
  }

  private async saveEvent(
    event: BlockchainEvent,
    contractConfig: any,
  ): Promise<void> {
    try {
      // Enhance event data with contract info
      const enhancedEvent = {
        ...event,
        data: {
          ...event.data,
          contractInfo: {
            name: contractConfig.name,
            symbol: contractConfig.symbol,
            type: contractConfig.type,
            priority: contractConfig.metadata?.priority,
            isStablecoin: contractConfig.metadata?.isStablecoin,
          },
        },
      };

      // Save to database
      const eventDoc = new this.blockchainEventModel(enhancedEvent);
      await eventDoc.save();

      this.logger.debug(
        `Saved ${contractConfig.symbol} event to database: ${event.transactionHash}`,
      );
    } catch (error) {
      this.logger.error(`Error saving event to database:`, error);
    }
  }

  // Public methods for analysis
  async getEventStats(
    contractAddress: string,
    chainId: number,
    hours: number = 24,
  ): Promise<any> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const stats = await this.blockchainEventModel.aggregate([
      {
        $match: {
          contractAddress: contractAddress.toLowerCase(),
          chainId,
          timestamp: { $gte: since.getTime() },
        },
      },
      {
        $group: {
          _id: '$data.event.name',
          count: { $sum: 1 },
          events: { $push: '$data.event.args' },
        },
      },
    ]);

    return stats;
  }

  async getLargeTransfers(
    contractAddress: string,
    chainId: number,
    hours: number = 24,
  ): Promise<any[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const largeTransfers = await this.blockchainEventModel
      .find({
        contractAddress: contractAddress.toLowerCase(),
        chainId,
        timestamp: { $gte: since.getTime() },
        'data.event.name': 'Transfer',
        'data.event.args.isLargeTransfer': true,
      })
      .sort({ timestamp: -1 });

    return largeTransfers;
  }
}
