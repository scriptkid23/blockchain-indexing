import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

const logger = new Logger('BlockchainWorker');

async function bootstrap() {
  logger.log('🚀 Starting Blockchain Indexing Worker...');
  
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // Enable simple API for monitoring (optional)
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  
  logger.log(`📡 Worker monitoring API available at http://localhost:${port}/worker`);
  logger.log('🔄 Blockchain indexing worker is running...');

  // Graceful shutdown handling
  process.on('SIGINT', async () => {
    logger.log('📤 Shutting down worker gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.log('📤 Worker terminated gracefully...');
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  logger.error('💥 Failed to start worker:', error);
  process.exit(1);
});
