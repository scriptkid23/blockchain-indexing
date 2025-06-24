<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

# Blockchain Indexing Framework

A production-ready, multi-chain blockchain indexing system built with NestJS that can monitor smart contract events across multiple networks simultaneously.

## 🌐 Multi-Chain Architecture

This framework supports monitoring **multiple contracts** across **multiple blockchains**:

### ✅ Currently Supported
- **Ethereum Mainnet** (Chain ID: 1)
- **BNB Smart Chain** (Chain ID: 56) 
- **Polygon** (Chain ID: 137)

### 🔄 Ready to Enable
- **Arbitrum One** (Chain ID: 42161)
- **Optimism** (Chain ID: 10)
- **Base** (Chain ID: 8453)
- **Avalanche C-Chain** (Chain ID: 43114)

### 🚧 Future Support
- **Solana** (Chain ID: 900)
- **SUI** (Chain ID: 1000)

## 🪙 Token Support

### Currently Configured Tokens:
- **USDT** - Deployed on Ethereum, BSC, Polygon
- **USDC** - Deployed on Ethereum, BSC, Polygon  
- **WETH** - Deployed on Ethereum, BSC, Polygon, Arbitrum
- **DAI** - Deployed on Ethereum, BSC, Polygon
- **SHIB** - Deployed on Ethereum

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone repository
git clone https://github.com/your-repo/blockchain-indexing.git
cd blockchain-indexing

# Start with default configuration (USDT + USDC on Ethereum, BSC, Polygon)
docker-compose up -d

# View logs
docker-compose logs -f app
```

### Option 2: Manual Setup

```bash
# Install dependencies
npm install

# Start MongoDB
docker-compose up -d mongo

# Set environment variables
export MONGODB_URI="mongodb://admin:admin123@localhost:27017/blockchain_indexing?authSource=admin"
export ENABLED_CHAINS="1,56,137"
export ENABLED_TOKENS="USDT,USDC"

# Start application
npm run start:dev
```

## ⚙️ Configuration

### Environment Variables

```bash
# Multi-Chain Configuration
ENABLED_CHAINS="1,56,137"           # Comma-separated chain IDs
ENABLED_TOKENS="USDT,USDC"          # Comma-separated token symbols

# RPC Endpoints (Optional overrides)
ETH_RPC_URL="https://ethereum-rpc.publicnode.com"
ETH_WS_URL="wss://ethereum-rpc.publicnode.com"
BSC_RPC_URL="https://bsc-rpc.publicnode.com"
BSC_WS_URL="wss://bsc-rpc.publicnode.com"

# Monitoring Thresholds
LARGE_TRANSFER_THRESHOLD_STABLECOIN=100000   # 100k for stablecoins
LARGE_TRANSFER_THRESHOLD_OTHER=1000000       # 1M for other tokens

# Feature Flags
ENABLE_WHALE_ALERTS="true"
ENABLE_MINT_BURN_TRACKING="true"
ENABLE_ANALYTICS="true"
```

### Docker Profiles

```bash
# Basic setup
docker-compose up -d

# With debugging tools (Mongo Express)
docker-compose --profile debug up -d

# With caching (Redis)
docker-compose --profile cache up -d

# With monitoring (Prometheus + Grafana)
docker-compose --profile monitoring up -d

# Everything
docker-compose --profile debug --profile cache --profile monitoring up -d
```

## 🔌 API Endpoints

### Contract Management

```bash
# View all contracts grouped by token
GET /blockchain/contracts/multi-chain

# View contracts for specific token
GET /blockchain/contracts/symbol/USDT

# Enable/disable tokens across all chains
POST /blockchain/contracts/enable-symbol/USDT
POST /blockchain/contracts/disable-symbol/USDT

# Enable/disable all contracts on specific chain
POST /blockchain/contracts/enable-chain/1
POST /blockchain/contracts/disable-chain/56
```

### Quick Configuration Modes

```bash
# Enable only USDT across all chains
POST /blockchain/quick-configs/usdt-only

# Enable all stablecoins (USDT, USDC, DAI)
POST /blockchain/quick-configs/stablecoins-only

# Enable only Ethereum mainnet contracts
POST /blockchain/quick-configs/ethereum-only
```

### Analytics

```bash
# Get token statistics
GET /blockchain/analytics/token-stats/0xdac17f958d2ee523a2206206994597c13d831ec7/1?hours=24

# Get monitoring summary
GET /blockchain/monitoring/summary
```

### System Control

```bash
# Check system status
GET /blockchain/status

# Start monitoring specific chain
POST /blockchain/start/1

# Stop monitoring specific chain  
POST /blockchain/stop/1
```

## 🏗️ Architecture

### Dynamic Listeners
- **WebSocket Listeners** - Real-time event monitoring
- **Block Scan Listeners** - Polling-based backup monitoring
- **Auto-discovery** - Automatically loads enabled contracts from MongoDB
- **Auto-refresh** - Periodically updates contract list (30s interval)

### Specific Handlers
- **ERC20TransferHandler** - Handles Transfer events for all ERC20 tokens
- **Whale Detection** - Identifies large transfers (>100k stablecoins, >1M others)
- **Mint/Burn Tracking** - Detects token minting and burning
- **Analytics** - Collects transfer statistics and volumes

### Database Design
- **Chain Configurations** - RPC endpoints, WebSocket URLs, metadata
- **Contract Configurations** - Addresses, ABIs, events to monitor
- **Contract Data** - Token metadata, supply, decimals
- **Blockchain Events** - All monitored events with enhanced data

## 🔧 Customization

### Adding New Tokens

1. **Via API** (Temporary):
```bash
POST /blockchain/contracts/enable-symbol/WBTC
```

2. **Via Database** (Permanent):
```typescript
// Add to contract-config.seeder.ts
{
  name: 'Wrapped Bitcoin',
  symbol: 'WBTC',
  type: 'erc20',
  deployments: [
    { chainId: 1, address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', enabled: true },
    { chainId: 56, address: '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c', enabled: true },
  ],
}
```

### Adding New Chains

1. **Update Chain Seeder**:
```typescript
// src/blockchain/seeders/chain-config.seeder.ts
{
  chainId: 250,
  name: 'Fantom Opera',
  symbol: 'FTM',
  type: 'evm',
  rpcUrl: 'https://rpc.ftm.tools',
  wsUrl: 'wss://wsapi.fantom.network',
  enabled: false,
}
```

2. **Enable via API**:
```bash
POST /blockchain/contracts/enable-chain/250
```

### Custom Event Handlers

```typescript
// Create new handler
@Injectable()
export class NFTTransferHandler implements IEventHandler {
  canHandle(event: BlockchainEvent): boolean {
    return event.eventType === 'contract_log' && 
           this.isNFTTransfer(event);
  }

  async handle(event: BlockchainEvent): Promise<void> {
    // Handle NFT transfers
  }
}

// Register in blockchain.module.ts
this.eventDispatcher.registerHandler(this.nftTransferHandler);
```

## 📊 Monitoring & Alerts

### Log Examples

```bash
# Normal transfer
USDT Transfer: 0x1234... → 0x5678... | 1,000.00 USDT | 0xabcd1234...

# Large transfer (Whale Alert)
🐋 WHALE ALERT: Large USDT Transfer: 0x1234... → 0x5678... | 500,000.00 USDT | 0xabcd1234...

# Mint event
🟢 MINT: 1,000,000.00 USDT minted to 0x5678... | 0xabcd1234...

# Burn event  
🔥 BURN: 500,000.00 USDT burned from 0x1234... | 0xabcd1234...
```

### Grafana Dashboards

Access monitoring dashboards at `http://localhost:3001`:
- Transfer volumes by chain
- Large transfer alerts
- System performance metrics
- Error rates and uptime

## 🛠️ Development

### Project Structure

```
src/
├── blockchain/
│   ├── core/                 # Event dispatching, SDK registry
│   ├── evm/                  # EVM-specific implementation
│   ├── handlers/             # Event handlers (ERC20, NFT, etc.)
│   ├── interfaces/           # TypeScript interfaces
│   ├── schemas/              # MongoDB schemas
│   ├── seeders/              # Database seeders
│   └── services/             # Business logic services
```

### Adding Support for New Blockchain

1. **Create SDK Service** (e.g., `solana-sdk.service.ts`)
2. **Create Listeners** (e.g., `solana-websocket.listener.ts`)
3. **Register in SDK Registry**
4. **Add Chain Configuration**
5. **Create Specific Handlers** if needed

### Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test specific chain
npm run test -- --grep "Ethereum"
```

## 🚨 Production Considerations

### Performance
- Use WebSocket connections for real-time monitoring
- Implement connection pooling for RPC endpoints
- Set appropriate reconnection strategies
- Monitor memory usage with large contract sets

### Security
- Use environment variables for sensitive data
- Implement rate limiting on API endpoints
- Validate all contract addresses
- Monitor for suspicious transaction patterns

### Scaling
- Horizontal scaling with multiple app instances
- Database sharding by chain ID
- Implement circuit breakers for RPC failures
- Use Redis for caching and session management

## 📋 Roadmap

- [x] Multi-chain EVM support
- [x] Dynamic contract loading
- [x] ERC20 transfer monitoring
- [x] Whale detection alerts
- [ ] NFT transfer monitoring (ERC721/ERC1155)
- [ ] DeFi protocol integration (Uniswap, Curve)
- [ ] Solana program monitoring
- [ ] Real-time WebSocket API for clients
- [ ] Advanced analytics and ML detection
- [ ] Mobile app for alerts

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Discord**: [Join our community](https://discord.gg/blockchain-indexing)
- **Issues**: [GitHub Issues](https://github.com/your-repo/blockchain-indexing/issues)
- **Documentation**: [Wiki](https://github.com/your-repo/blockchain-indexing/wiki)

---

Built with ❤️ for the blockchain community
