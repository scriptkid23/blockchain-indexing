import { Injectable } from '@nestjs/common';
import { BlockchainEvent } from '../interfaces/blockchain.interface';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BlockchainEvent as BlockchainEventDocument,
  BlockchainEventDocument as BlockchainEventDoc,
} from '../schemas/blockchain-event.schema';
import { BaseEventHandler } from './base-event.handler';
import {
  ERC20_EVENTS,
  getEventSignatureHash,
  getABI,
} from '../evm/utils/evm-constants';

@Injectable()
export class ERC20TransferHandler extends BaseEventHandler {
  // Transfer event name (simple string instead of complex hash)
  private readonly TRANSFER_EVENT_NAME = ERC20_EVENTS.TRANSFER;

  constructor(
    @InjectModel(BlockchainEventDocument.name)
    blockchainEventModel: Model<BlockchainEventDoc>,
  ) {
    super(blockchainEventModel);
  }

  protected async processBatch(events: BlockchainEvent[]): Promise<void> {
    this.logger.log(
      `📋 Processed ${events.length} ERC20 Transfer events`,
    );
    
    // Simple logging for each event
    for (const event of events) {
      const contractName = event.data?.contract?.name || event.data?.contract?.symbol || 'Unknown';
      const eventArgs = event.data?.event?.args;
      
      if (eventArgs && eventArgs.from && eventArgs.to && eventArgs.value) {
        this.logger.log(
          `🔄 ${contractName} Transfer: ${eventArgs.from} -> ${eventArgs.to} | Value: ${eventArgs.value}`,
        );
      } else {
        this.logger.log(
          `🔄 ${contractName} Transfer event at block ${event.blockNumber} (tx: ${event.transactionHash.substring(0, 10)}...)`,
        );
      }
    }
  }

  canHandle(event: BlockchainEvent): boolean {
    // Handle Transfer events for all ERC20 contracts
    const isContractLog = event.eventType === 'contract_log';
    const hasContractAddress = !!event.contractAddress;
    const isTransfer = this.isTransferEvent(event);

    const canHandle = isContractLog && hasContractAddress && isTransfer;

    if (!canHandle) {
      this.logger.debug(
        `🔍 Handler check - Contract log: ${isContractLog}, Has address: ${hasContractAddress}, Is transfer: ${isTransfer}, Event name: ${event.data?.event?.name}`,
      );
    }

    return canHandle;
  }

  private isTransferEvent(event: BlockchainEvent): boolean {
    // Check if event has signature in data.event.signature
    if (event.data?.event?.signature) {
      const eventSignature = event.data.event.signature;
      const abi = getABI('erc20');
      const transferSignature = getEventSignatureHash(
        this.TRANSFER_EVENT_NAME,
        abi,
      );
      return eventSignature === transferSignature;
    }

    // Fallback: check topics array
    const topics = (event.data?.topics as string[]) || [];
    if (!topics[0]) {
      this.logger.debug(
        `No event signature found for event: ${JSON.stringify({
          eventType: event.eventType,
          contractAddress: event.contractAddress,
          hasDataEvent: !!event.data?.event,
          hasTopics: topics.length > 0,
          eventName: event.data?.event?.name,
        })}`,
      );
      return false;
    }

    // Get Transfer event signature hash dynamically
    const abi = getABI('erc20');
    const transferSignature = getEventSignatureHash(
      this.TRANSFER_EVENT_NAME,
      abi,
    );

    return topics[0] === transferSignature;
  }

}
