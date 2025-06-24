import {
  Controller,
  Get,
  Post,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BlockchainService } from './blockchain.service';

@Controller('worker')
export class BlockchainController {
  constructor(
    private readonly blockchainService: BlockchainService,
  ) {}

  @Get('status')
  getWorkerStatus() {
    return {
      status: 'running',
      timestamp: new Date().toISOString(),
      ...this.blockchainService.getSystemStatus(),
    };
  }

  @Post('start')
  async startWorker() {
    try {
      await this.blockchainService.startListeners();
      return { 
        success: true,
        message: 'Blockchain indexing worker started successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to start worker',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('stop')
  async stopWorker() {
    try {
      await this.blockchainService.stopAllListeners();
      return { 
        success: true,
        message: 'Blockchain indexing worker stopped successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to stop worker',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('restart')
  async restartWorker() {
    try {
      await this.blockchainService.stopAllListeners();
      await this.blockchainService.startListeners();
      return { 
        success: true,
        message: 'Blockchain indexing worker restarted successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to restart worker',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }
}
