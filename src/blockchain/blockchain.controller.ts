import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Query,
} from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { EventStrategy } from './interfaces/blockchain.interface';
import { ContractConfigSeeder } from './seeders/contract-config.seeder';
import { ERC20TransferHandler } from './handlers/erc20-transfer.handler';
import { ContractConfigService } from './services/contract-config.service';
import { ChainConfigService } from './services/chain-config.service';

@Controller('blockchain')
export class BlockchainController {
  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly contractConfigSeeder: ContractConfigSeeder,
    private readonly erc20Handler: ERC20TransferHandler,
    private readonly contractConfigService: ContractConfigService,
    private readonly chainConfigService: ChainConfigService,
  ) {}

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
        HttpStatus.INTERNAL_SERVER_ERROR,
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
      return {
        message: `Listener for chain ${chainIdNum} restarted successfully`,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to restart listener',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('chains/:chainId/strategy')
  async switchStrategy(
    @Param('chainId') chainId: string,
    @Body() body: { strategy: EventStrategy },
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
        message: `Strategy for chain ${chainIdNum} switched to ${body.strategy}`,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to switch strategy',
        HttpStatus.INTERNAL_SERVER_ERROR,
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
        HttpStatus.INTERNAL_SERVER_ERROR,
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
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/contracts/multi-chain')
  async getMultiChainContracts() {
    try {
      const contracts = await this.contractConfigService.getMultiChainContracts();
      return {
        success: true,
        data: contracts,
        message: 'Multi-chain contracts retrieved successfully',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to get multi-chain contracts: ${error.message}`,
      );
    }
  }

  @Get('/contracts/symbol/:symbol')
  async getContractsBySymbol(@Param('symbol') symbol: string) {
    try {
      const contracts = await this.contractConfigService.findBySymbol(symbol);
      return {
        success: true,
        data: contracts,
        count: contracts.length,
        message: `Contracts for ${symbol} retrieved successfully`,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to get contracts for ${symbol}: ${error.message}`,
      );
    }
  }

  @Post('/contracts/enable-symbol/:symbol')
  async enableContractsBySymbol(@Param('symbol') symbol: string) {
    try {
      await this.contractConfigSeeder.updateContractsBySymbol(symbol, true);
      return {
        success: true,
        message: `Enabled all ${symbol} contracts across all chains`,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to enable ${symbol} contracts: ${error.message}`,
      );
    }
  }

  @Post('/contracts/disable-symbol/:symbol')
  async disableContractsBySymbol(@Param('symbol') symbol: string) {
    try {
      await this.contractConfigSeeder.updateContractsBySymbol(symbol, false);
      return {
        success: true,
        message: `Disabled all ${symbol} contracts across all chains`,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to disable ${symbol} contracts: ${error.message}`,
      );
    }
  }

  @Post('/contracts/enable-chain/:chainId')
  async enableContractsByChain(@Param('chainId') chainId: string) {
    try {
      const chainIdNum = parseInt(chainId, 10);
      await this.contractConfigSeeder.updateContractsByChain(chainIdNum, true);
      return {
        success: true,
        message: `Enabled all contracts on chain ${chainId}`,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to enable contracts on chain ${chainId}: ${error.message}`,
      );
    }
  }

  @Post('/contracts/disable-chain/:chainId')
  async disableContractsByChain(@Param('chainId') chainId: string) {
    try {
      const chainIdNum = parseInt(chainId, 10);
      await this.contractConfigSeeder.updateContractsByChain(chainIdNum, false);
      return {
        success: true,
        message: `Disabled all contracts on chain ${chainId}`,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to disable contracts on chain ${chainId}: ${error.message}`,
      );
    }
  }

  @Post('/quick-configs/usdt-only')
  async enableUSDTOnly() {
    try {
      await this.contractConfigSeeder.enableUSDTOnly();
      return {
        success: true,
        message: 'Enabled USDT-only monitoring mode',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to enable USDT-only mode: ${error.message}`,
      );
    }
  }

  @Post('/quick-configs/stablecoins-only')
  async enableStablecoinsOnly() {
    try {
      await this.contractConfigSeeder.enableStablecoinsOnly();
      return {
        success: true,
        message: 'Enabled stablecoins-only monitoring mode',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to enable stablecoins-only mode: ${error.message}`,
      );
    }
  }

  @Post('/quick-configs/ethereum-only')
  async enableEthereumOnly() {
    try {
      await this.contractConfigSeeder.enableEthereumMainnetOnly();
      return {
        success: true,
        message: 'Enabled Ethereum mainnet-only monitoring mode',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to enable Ethereum-only mode: ${error.message}`,
      );
    }
  }

  @Get('/analytics/token-stats/:address/:chainId')
  async getTokenStats(
    @Param('address') address: string,
    @Param('chainId') chainId: string,
    @Query('hours') hours?: string,
  ) {
    try {
      const chainIdNum = parseInt(chainId, 10);
      const hoursNum = hours ? parseInt(hours, 10) : 24;
      
      const stats = await this.erc20Handler.getTokenStats(
        address,
        chainIdNum,
        hoursNum,
      );
      
      return {
        success: true,
        data: stats,
        timeframe: `${hoursNum} hours`,
        message: 'Token statistics retrieved successfully',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to get token stats: ${error.message}`,
      );
    }
  }

  @Get('/monitoring/summary')
  async getMonitoringSummary() {
    try {
      // Get multi-chain token summary
      const multiChainTokens = await this.contractConfigService.getMultiChainContracts();
      
      return {
        success: true,
        data: {
          multiChainTokens: multiChainTokens.map(token => ({
            symbol: token.symbol,
            totalDeployments: token.deployments.length,
            enabledDeployments: token.deployments.filter(d => d.enabled).length,
            enabledChains: token.deployments
              .filter(d => d.enabled)
              .map(d => d.chainId),
          })),
        },
        message: 'Monitoring summary retrieved successfully',
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to get monitoring summary: ${error.message}`,
      );
    }
  }
}
