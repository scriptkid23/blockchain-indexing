import { Controller, Get, Post, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { EventStrategy } from './interfaces/blockchain.interface';

@Controller('blockchain')
export class BlockchainController {
  constructor(private readonly blockchainService: BlockchainService) {}

  @Get('status')
  getSystemStatus() {
    return this.blockchainService.getSystemStatus();
  }

  @Get('chains/:chainId/status')
  async getChainStatus(@Param('chainId') chainId: string) {
    try {
      const chainIdNum = parseInt(chainId, 10);
      if (isNaN(chainIdNum)) {
        throw new HttpException('Invalid chain ID', HttpStatus.BAD_REQUEST);
      }
      
      return await this.blockchainService.getChainStatus(chainIdNum);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get chain status',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('chains/:chainId/restart')
  async restartListener(@Param('chainId') chainId: string) {
    try {
      const chainIdNum = parseInt(chainId, 10);
      if (isNaN(chainIdNum)) {
        throw new HttpException('Invalid chain ID', HttpStatus.BAD_REQUEST);
      }
      
      await this.blockchainService.restartListener(chainIdNum);
      return { message: `Listener for chain ${chainIdNum} restarted successfully` };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to restart listener',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('chains/:chainId/strategy')
  async switchStrategy(
    @Param('chainId') chainId: string,
    @Body() body: { strategy: EventStrategy }
  ) {
    try {
      const chainIdNum = parseInt(chainId, 10);
      if (isNaN(chainIdNum)) {
        throw new HttpException('Invalid chain ID', HttpStatus.BAD_REQUEST);
      }

      if (!Object.values(EventStrategy).includes(body.strategy)) {
        throw new HttpException('Invalid strategy', HttpStatus.BAD_REQUEST);
      }
      
      await this.blockchainService.switchStrategy(chainIdNum, body.strategy);
      return { 
        message: `Strategy for chain ${chainIdNum} switched to ${body.strategy}` 
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to switch strategy',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('listeners/stop')
  async stopAllListeners() {
    try {
      await this.blockchainService.stopAllListeners();
      return { message: 'All listeners stopped successfully' };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to stop listeners',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('listeners/start')
  async startListeners() {
    try {
      await this.blockchainService.startListeners();
      return { message: 'All listeners started successfully' };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to start listeners',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 