import { Injectable, Logger } from '@nestjs/common';
import {
  ContractConfigService,
  CreateContractConfigDto,
} from '../services/contract-config.service';
import { AbiUtils } from '../evm/utils/abi-utils';

// Get ERC-20 event signatures using AbiUtils (no hardcoding!)
// This dynamically generates signatures from event declarations
const ERC20_EVENT_SIGNATURES = AbiUtils.getCommonERC20EventSignatures();
const ERC20_EVENT_SIGNATURES_ARRAY = AbiUtils.getEventSignaturesByType('erc20');

// Standard ERC-20 ABI for Transfer and Approval events
const ERC20_EVENTS_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

// Multi-chain contract configurations
interface MultiChainContract {
  name: string;
  symbol: string;
  type: string;
  description: string;
  metadata: any;
  deployments: {
    chainId: number;
    address: string;
    enabled: boolean;
  }[];
}

@Injectable()
export class ContractConfigSeeder {
  private readonly logger = new Logger(ContractConfigSeeder.name);

  constructor(private readonly contractConfigService: ContractConfigService) {}

  async seed(): Promise<void> {
    this.logger.log('Starting multi-chain contract config seeding...');

    try {
      await this.seedMultiChainContracts();
      this.logger.log('Multi-chain contract config seeding completed successfully');
    } catch (error) {
      this.logger.error('Error during contract config seeding:', error);
      throw error;
    }
  }

  private async seedMultiChainContracts(): Promise<void> {
    // Simplified: Only Sepolia with single token
    const contractConfig: CreateContractConfigDto = {
      address: '0xF894E8f72ee3FF8f706C9ba744d3c49544C00c88',
      chainId: 11155111, // Sepolia
      name: 'Test Token',
      symbol: 'TEST',
      type: 'erc20',
      events: ERC20_EVENT_SIGNATURES_ARRAY,
      abi: ERC20_EVENTS_ABI,
      enabled: true,
      description: 'Test token on Sepolia testnet',
      startBlock: 10019681, // Starting block for scanning
      metadata: {
        decimals: 18,
        isStablecoin: false,
        priority: 'medium',
      },
    };

    try {
      const existing = await this.contractConfigService.findByAddress(
        contractConfig.address,
        contractConfig.chainId,
      );

      if (!existing) {
        await this.contractConfigService.create(contractConfig);
        this.logger.log(
          `✅ Created: ${contractConfig.symbol} on Sepolia (${contractConfig.address})`,
        );
      } else {
        this.logger.log(
          `⏭️  Already exists: ${contractConfig.symbol} on Sepolia - skipping`,
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ Error processing ${contractConfig.symbol} on Sepolia:`,
        error,
      );
    }
  }

  private async processMultiChainContract(multiChainContract: MultiChainContract): Promise<void> {
    this.logger.log(`Processing ${multiChainContract.symbol} across ${multiChainContract.deployments.length} chains`);

    for (const deployment of multiChainContract.deployments) {
      const contractConfig: CreateContractConfigDto = {
        address: deployment.address,
        chainId: deployment.chainId,
        name: multiChainContract.name,
        symbol: multiChainContract.symbol,
        type: multiChainContract.type,
        events: ERC20_EVENT_SIGNATURES_ARRAY, // Use AbiUtils instead of hardcoded signatures
        abi: ERC20_EVENTS_ABI,
        enabled: deployment.enabled,
        description: `${multiChainContract.description} (Chain ID: ${deployment.chainId})`,
        startBlock: 10019681, // Starting block for scanning
        metadata: {
          ...multiChainContract.metadata,
          chainId: deployment.chainId,
          isMultiChain: true,
          totalDeployments: multiChainContract.deployments.length,
        },
      };

      try {
        const existing = await this.contractConfigService.findByAddress(
          contractConfig.address,
          contractConfig.chainId,
        );

        if (!existing) {
          await this.contractConfigService.create(contractConfig);
          this.logger.log(
            `✅ Created: ${contractConfig.symbol} on chain ${contractConfig.chainId} (${deployment.enabled ? 'ENABLED' : 'DISABLED'})`,
          );
        } else {
          this.logger.log(
            `⏭️  Already exists: ${contractConfig.symbol} on chain ${contractConfig.chainId} (${existing.enabled ? 'ENABLED' : 'DISABLED'}) - skipping to avoid override`,
          );
        }
      } catch (error) {
        this.logger.error(
          `❌ Error processing ${contractConfig.symbol} on chain ${contractConfig.chainId}:`,
          error,
        );
      }
    }
  }

  // Helper method to enable/disable contracts by symbol across all chains
  async updateContractsBySymbol(
    symbol: string,
    enabled: boolean,
  ): Promise<void> {
    try {
      const contracts = await this.contractConfigService.findBySymbol(symbol);
      
      for (const contract of contracts) {
        await this.contractConfigService.updateEnabled(
          contract.address,
          contract.chainId,
          enabled,
        );
      }
      
      this.logger.log(
        `Updated ${contracts.length} ${symbol} contracts to ${enabled ? 'enabled' : 'disabled'}`,
      );
    } catch (error) {
      this.logger.error(
        `Error updating contracts for symbol ${symbol}:`,
        error,
      );
    }
  }

  // Helper method to enable/disable contracts by chain
  async updateContractsByChain(
    chainId: number,
    enabled: boolean,
  ): Promise<void> {
    try {
      const contracts = await this.contractConfigService.findByChainId(chainId);
      
      for (const contract of contracts) {
        await this.contractConfigService.updateEnabled(
          contract.address,
          contract.chainId,
          enabled,
        );
      }
      
      this.logger.log(
        `Updated ${contracts.length} contracts on chain ${chainId} to ${enabled ? 'enabled' : 'disabled'}`,
      );
    } catch (error) {
      this.logger.error(
        `Error updating contracts for chain ${chainId}:`,
        error,
      );
    }
  }

  // Enable specific configurations (examples)
  async enableUSDTOnly(): Promise<void> {
    this.logger.log('Enabling USDT only across all chains...');
    await this.updateContractsBySymbol('USDT', true);
    await this.updateContractsBySymbol('USDC', false);
    await this.updateContractsBySymbol('WETH', false);
    await this.updateContractsBySymbol('DAI', false);
    await this.updateContractsBySymbol('SHIB', false);
    this.logger.log('USDT-only mode activated');
  }

  async enableStablecoinsOnly(): Promise<void> {
    this.logger.log('Enabling stablecoins only...');
    await this.updateContractsBySymbol('USDT', true);
    await this.updateContractsBySymbol('USDC', true);
    await this.updateContractsBySymbol('DAI', true);
    await this.updateContractsBySymbol('WETH', false);
    await this.updateContractsBySymbol('SHIB', false);
    this.logger.log('Stablecoins-only mode activated');
  }

  async enableEthereumMainnetOnly(): Promise<void> {
    this.logger.log('Enabling Ethereum mainnet contracts only...');
    await this.updateContractsByChain(1, true); // Ethereum
    await this.updateContractsByChain(56, false); // BSC
    await this.updateContractsByChain(137, false); // Polygon
    await this.updateContractsByChain(42161, false); // Arbitrum
    this.logger.log('Ethereum mainnet-only mode activated');
  }
}
