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

A comprehensive multi-blockchain indexing system built with NestJS that supports real-time event processing across multiple blockchain networks including EVM chains (Ethereum, BSC, Polygon, Arbitrum), Solana, and future SUI support.

## Features

- **Multi-chain Support**: EVM chains, Solana, and extensible for SUI
- **Multiple Event Strategies**: WebSocket, Block Scanning, and Hybrid approaches
- **Real-time Processing**: Event dispatcher with queue management
- **Modular Architecture**: Easily extensible for new blockchain types
- **Configuration Management**: Environment-based chain configurations
- **REST API**: Control and monitor the indexing system
- **Graceful Shutdown**: Proper cleanup of connections and listeners

## Architecture

The system follows a modular architecture with the following key components:

### Core Layer
- **SDK Registry**: Manages blockchain SDKs with factory pattern
- **Event Dispatcher**: Processes and routes blockchain events
- **Listener Factory**: Creates and manages event listeners
- **Configuration Service**: Handles multi-chain configurations

### Blockchain Modules
- **EVM Module**: Supports Ethereum, BSC, Polygon, Arbitrum
- **Solana Module**: (To be implemented)
- **SUI Module**: (Future support)

### Event Strategies
- **WebSocket Strategy**: Real-time event streaming
- **Block Scan Strategy**: Periodic block scanning
- **Hybrid Strategy**: Combines both approaches

## Installation

```bash
npm install
```

## Configuration

1. Copy the environment example file:
```bash
cp .env.example .env
```

2. Update the `.env` file with your RPC endpoints and API keys:

```env
# Ethereum Configuration
ETH_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
ETH_WS_URL=wss://mainnet.infura.io/ws/v3/YOUR_PROJECT_ID
ETH_ENABLED=true

# BSC Configuration
BSC_RPC_URL=https://bsc-dataseed1.binance.org
BSC_ENABLED=true

# Add other chain configurations...
```

## Usage

### Starting the Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

### API Endpoints

#### System Status
```bash
GET /blockchain/status
```
Returns overall system status including enabled chains, active listeners, and queue information.

#### Chain Status
```bash
GET /blockchain/chains/:chainId/status
```
Get status for a specific chain.

#### Restart Listener
```bash
POST /blockchain/chains/:chainId/restart
```
Restart the listener for a specific chain.

#### Switch Strategy
```bash
POST /blockchain/chains/:chainId/strategy
Content-Type: application/json

{
  "strategy": "websocket|block_scan|hybrid"
}
```

#### Control All Listeners
```bash
POST /blockchain/listeners/start
POST /blockchain/listeners/stop
```

### Example Response

```json
{
  "enabled_chains": 4,
  "active_listeners": 4,
  "running_listeners": 4,
  "registered_handlers": 1,
  "event_queue_size": 0,
  "supported_chain_types": ["evm"],
  "chains": [
    {
      "chain_id": 1,
      "name": "Ethereum Mainnet",
      "type": "evm",
      "strategy": "websocket",
      "is_running": true,
      "is_supported": true
    }
  ]
}
```

## Adding New Blockchains

### 1. Create SDK Service

```typescript
// src/blockchain/newchain/newchain-sdk.service.ts
export class NewChainSdkService implements IBlockchainSDK {
  // Implement required methods
}
```

### 2. Create Listeners

```typescript
// src/blockchain/newchain/listeners/newchain-websocket.listener.ts
export class NewChainWebSocketListener implements IBlockchainListener {
  // Implement required methods
}
```

### 3. Register SDK Factory

```typescript
// In blockchain.module.ts
this.sdkRegistry.registerSDKFactory(
  ChainType.NEWCHAIN,
  async (chainId: number) => {
    return new NewChainSdkService(chainId, this.configService, this.eventDispatcher);
  }
);
```

### 4. Add Configuration

```typescript
// In blockchain.config.ts
this.addChainConfig({
  chainId: 999,
  name: 'New Chain',
  type: ChainType.NEWCHAIN,
  rpcUrl: this.configService.get('NEWCHAIN_RPC_URL'),
  strategy: EventStrategy.WEBSOCKET,
  enabled: this.configService.get('NEWCHAIN_ENABLED', false),
});
```

## Event Handlers

Create custom event handlers by implementing the `IEventHandler` interface:

```typescript
@Injectable()
export class CustomEventHandler implements IEventHandler {
  async handle(event: BlockchainEvent): Promise<void> {
    // Process the event
  }

  canHandle(event: BlockchainEvent): boolean {
    // Return true if this handler should process the event
    return event.contractAddress === '0x123...';
  }
}
```

Register handlers in the blockchain module:

```typescript
this.eventDispatcher.registerHandler(new CustomEventHandler());
```

## Supported Chain IDs

- **Ethereum Mainnet**: 1
- **BSC Mainnet**: 56
- **Polygon**: 137
- **Arbitrum One**: 42161
- **Solana Mainnet**: 900
- **Solana Devnet**: 901
- **SUI Mainnet**: 1000 (Future)

## Development

### Running Tests

```bash
npm run test
npm run test:e2e
```

### Code Quality

```bash
npm run lint
npm run format
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Implement your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
