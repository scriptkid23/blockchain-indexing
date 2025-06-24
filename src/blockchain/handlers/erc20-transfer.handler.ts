import { Injectable, Logger } from '@nestjs/common';
import {
  BlockchainEvent,
  IEventHandler,
} from '../interfaces/blockchain.interface';
import { ContractDataService } from '../services/contract-data.service';
import { ContractConfigService } from '../services/contract-config.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BlockchainEvent as BlockchainEventDocument,
  BlockchainEventDocument as BlockchainEventDoc,
} from '../schemas/blockchain-event.schema';
import {
  ERC20_EVENTS,
  getEventSignatureHash,
  getABI,
  formatTokenAmount,
  isLargeTransfer,
} from '../evm/utils/evm-constants';

interface ERC20TransferData {
  from: string;
  to: string;
  value: string;
  valueFormatted: string;
  isLargeTransfer: boolean;
  contractInfo: {
    name: string;
    symbol: string;
    decimals: number;
    isStablecoin?: boolean;
    priority?: string;
  };
}

interface TransferEventArgs {
  from: string;
  to: string;
  value: string;
  valueFormatted?: string;
  isLargeTransfer?: boolean;
}

@Injectable()
export class ERC20TransferHandler implements IEventHandler {
  private readonly logger = new Logger(ERC20TransferHandler.name);

  // Transfer event name (simple string instead of complex hash)
  private readonly TRANSFER_EVENT_NAME = ERC20_EVENTS.TRANSFER;

  constructor(
    private readonly contractDataService: ContractDataService,
    private readonly contractConfigService: ContractConfigService,
    @InjectModel(BlockchainEventDocument.name)
    private blockchainEventModel: Model<BlockchainEventDoc>,
  ) {}

  async handle(event: BlockchainEvent): Promise<void> {
    try {
      // Get contract configuration
      const contractConfig = await this.contractConfigService.findByAddress(
        event.contractAddress!,
        event.chainId,
      );

      if (!contractConfig) {
        this.logger.debug(
          `No contract config found for ${event.contractAddress} on chain ${event.chainId}`,
        );
        return;
      }

      // Extract transfer data from event
      const transferData = await this.extractTransferData(event, contractConfig);
      if (!transferData) {
        return;
      }

      // Process the transfer (format and log)
      await this.processERC20Transfer(event, transferData);

      // Save enhanced event to database
      await this.saveEvent(event, transferData);
    } catch (error) {
      this.logger.error(`Error handling ERC20 Transfer event:`, error);
      throw error;
    }
  }

  canHandle(event: BlockchainEvent): boolean {
    // Handle Transfer events for all ERC20 contracts
    return (
      event.eventType === 'contract_log' &&
      !!event.contractAddress &&
      this.isTransferEvent(event)
    );
  }

  private isTransferEvent(event: BlockchainEvent): boolean {
    const topics = (event.data?.topics as string[]) || [];
    if (!topics[0]) return false;
    
    // Get Transfer event signature hash dynamically
    const abi = getABI('erc20');
    const transferSignature = getEventSignatureHash(this.TRANSFER_EVENT_NAME, abi);
    
    return topics[0] === transferSignature;
  }

  private async extractTransferData(
    event: BlockchainEvent,
    contractConfig: any,
  ): Promise<ERC20TransferData | null> {
    try {
      const eventData = event.data?.event as
        | { args?: TransferEventArgs }
        | undefined;
      const args = eventData?.args;

      if (!args || !args.from || !args.to || !args.value) {
        this.logger.debug(`Invalid Transfer event data structure`);
        return null;
      }

      const contractInfo = {
        name: contractConfig.name,
        symbol: contractConfig.symbol,
        decimals: contractConfig.metadata?.decimals || 18,
        isStablecoin: contractConfig.metadata?.isStablecoin || false,
        priority: contractConfig.metadata?.priority || 'medium',
      };

      const value = args.value;
      const valueFormatted = this.formatTokenValue(value, contractInfo.decimals);
      const isLargeTransferResult = this.isLargeTransferCheck(
        value,
        contractInfo.decimals,
        contractInfo.isStablecoin,
      );

      return {
        from: args.from,
        to: args.to,
        value,
        valueFormatted,
        isLargeTransfer: isLargeTransferResult,
        contractInfo,
      };
    } catch (error) {
      this.logger.error(`Error extracting transfer data:`, error);
      return null;
    }
  }

  private formatTokenValue(value: string, decimals: number): string {
    return formatTokenAmount(value, decimals);
  }

  private isLargeTransferCheck(
    value: string,
    decimals: number,
    isStablecoin: boolean,
  ): boolean {
    return isLargeTransfer(value, decimals, isStablecoin);
  }

  private async processERC20Transfer(
    event: BlockchainEvent,
    transferData: ERC20TransferData,
  ): Promise<void> {
    const { from, to, valueFormatted, isLargeTransfer, contractInfo } =
      transferData;
    const txHash = event.transactionHash.slice(0, 10) + '...';
    const fromShort = from.slice(0, 6) + '...';
    const toShort = to.slice(0, 6) + '...';

    // Base transfer message
    const message = `${contractInfo.symbol} Transfer: ${fromShort} → ${toShort} | ${valueFormatted} ${contractInfo.symbol} | ${txHash}`;

    // Log based on transfer size and priority
    if (isLargeTransfer) {
      this.logger.warn(`🐋 WHALE ALERT: Large ${message}`);
    } else if (contractInfo.priority === 'high') {
      this.logger.log(`⭐ HIGH PRIORITY: ${message}`);
    } else {
      this.logger.log(message);
    }

    // Special cases
    if (from === '0x0000000000000000000000000000000000000000') {
      this.logger.log(
        `🟢 MINT: ${valueFormatted} ${contractInfo.symbol} minted to ${toShort} | ${txHash}`,
      );
    } else if (to === '0x0000000000000000000000000000000000000000') {
      this.logger.log(
        `🔥 BURN: ${valueFormatted} ${contractInfo.symbol} burned from ${fromShort} | ${txHash}`,
      );
    }

    // Update contract metadata
    await this.updateContractMetadata(event, transferData);
  }

  private async updateContractMetadata(
    event: BlockchainEvent,
    transferData: ERC20TransferData,
  ): Promise<void> {
    try {
      // Try to get existing contract data
      let contractData = await this.contractDataService.findByAddress(
        event.contractAddress!,
        event.chainId,
      );

      if (!contractData) {
        // Create initial contract data with block tracking
        contractData = await this.contractDataService.saveERC20Data(
          event.contractAddress!,
          event.chainId,
          {
            name: transferData.contractInfo.name,
            symbol: transferData.contractInfo.symbol,
            decimals: transferData.contractInfo.decimals,
            totalSupply: '0',
            firstSeenBlock: event.blockNumber,
            startFromBlock: event.blockNumber,
          },
        );

        // Update with transfer metadata and block tracking
        await this.contractDataService.updateContract(
          event.contractAddress!,
          event.chainId,
          {
            lastProcessedBlock: event.blockNumber,
            metadata: {
              ...contractData.metadata,
              lastBlock: event.blockNumber, // Legacy field, keep for compatibility
              transferCount: 1,
              largeTransferCount: transferData.isLargeTransfer ? 1 : 0,
              lastTransferTimestamp: event.timestamp,
              isStablecoin: transferData.contractInfo.isStablecoin,
              priority: transferData.contractInfo.priority,
            },
          },
        );
      } else {
        // Update existing contract data
        const currentTransferCount = contractData.metadata?.transferCount || 0;
        const currentLargeTransferCount =
          contractData.metadata?.largeTransferCount || 0;

        // Update block tracking
        await this.contractDataService.updateLastProcessedBlock(
          event.contractAddress!,
          event.chainId,
          event.blockNumber,
        );

        // Set first seen block if not set
        if (!contractData.firstSeenBlock) {
          await this.contractDataService.setFirstSeenBlock(
            event.contractAddress!,
            event.chainId,
            event.blockNumber,
          );
        }

        // Update metadata
        await this.contractDataService.updateContract(
          event.contractAddress!,
          event.chainId,
          {
            metadata: {
              ...contractData.metadata,
              lastBlock: event.blockNumber, // Legacy field, keep for compatibility
              transferCount: currentTransferCount + 1,
              largeTransferCount:
                currentLargeTransferCount +
                (transferData.isLargeTransfer ? 1 : 0),
              lastTransferTimestamp: event.timestamp,
            },
          },
        );
      }

      this.logger.debug(
        `📊 Updated ${transferData.contractInfo.symbol} metadata: block ${event.blockNumber}, transfers: ${(contractData.metadata?.transferCount || 0) + 1}`,
      );
    } catch (error) {
      this.logger.error(
        `Error updating ${transferData.contractInfo.symbol} contract metadata:`,
        error,
      );
    }
  }

  private async saveEvent(
    event: BlockchainEvent,
    transferData: ERC20TransferData,
  ): Promise<void> {
    try {
      // Check if event already exists to prevent duplicates
      const existingEvent = await this.blockchainEventModel.findOne({
        transactionHash: event.transactionHash,
        logIndex: event.data?.logIndex,
        chainId: event.chainId,
      });

      if (existingEvent) {
        this.logger.debug(
          `Event already exists for ${transferData.contractInfo.symbol} Transfer: ${event.transactionHash} (logIndex: ${event.data?.logIndex})`,
        );
        return;
      }

      // Enhanced event data with ERC20-specific information
      const enhancedEvent = {
        ...event,
        logIndex: event.data?.logIndex,
        transactionIndex: event.data?.transactionIndex,
        data: {
          ...event.data,
          contractInfo: {
            ...transferData.contractInfo,
            type: 'erc20',
          },
          transferInfo: {
            ...transferData,
            transferType: this.getTransferType(
              transferData.from,
              transferData.to,
            ),
            tokenAmount: parseFloat(
              transferData.valueFormatted.replace(/,/g, ''),
            ),
          },
        },
      };

      // Save to database
      const eventDoc = new this.blockchainEventModel(enhancedEvent);
      await eventDoc.save();

      this.logger.debug(
        `✅ Saved ${transferData.contractInfo.symbol} Transfer event: ${event.transactionHash} (logIndex: ${event.data?.logIndex})`,
      );
    } catch (error) {
      // Check if it's a duplicate key error
      if (error.code === 11000) {
        this.logger.debug(
          `⚠️  Duplicate event detected for ${transferData.contractInfo.symbol} Transfer: ${event.transactionHash} (logIndex: ${event.data?.logIndex})`,
        );
        return;
      }
      
      this.logger.error(`❌ Error saving ERC20 event to database:`, error);
    }
  }

  private getTransferType(from: string, to: string): string {
    const zeroAddress = '0x0000000000000000000000000000000000000000';

    if (from === zeroAddress) return 'mint';
    if (to === zeroAddress) return 'burn';
    return 'transfer';
  }

  // Analytics methods
  async getTokenStats(
    contractAddress: string,
    chainId: number,
    hours: number = 24,
  ): Promise<{
    totalTransfers: number;
    largeTransfers: number;
    totalVolume: string;
    largeVolume: string;
  }> {
    try {
      const since = Date.now() - hours * 60 * 60 * 1000;

      const events = await this.blockchainEventModel.find({
        chainId,
        contractAddress,
        timestamp: { $gte: since },
        'data.event.name': 'Transfer',
      });

      let totalTransfers = 0;
      let largeTransfers = 0;
      let totalVolume = 0;
      let largeVolume = 0;

      events.forEach((event) => {
        const transferInfo = event.data?.transferInfo as
          | { isLargeTransfer?: boolean; tokenAmount?: number }
          | undefined;
        const amount = transferInfo?.tokenAmount || 0;

        totalTransfers++;
        totalVolume += amount;

        if (transferInfo?.isLargeTransfer) {
          largeTransfers++;
          largeVolume += amount;
        }
      });

      return {
        totalTransfers,
        largeTransfers,
        totalVolume: totalVolume.toLocaleString('en-US', {
          minimumFractionDigits: 2,
        }),
        largeVolume: largeVolume.toLocaleString('en-US', {
          minimumFractionDigits: 2,
        }),
      };
    } catch (error) {
      this.logger.error(`Error getting token stats:`, error);
      return {
        totalTransfers: 0,
        largeTransfers: 0,
        totalVolume: '0',
        largeVolume: '0',
      };
    }
  }
} 