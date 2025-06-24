import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlockchainModule } from './blockchain/blockchain.module';
import { BlockchainService } from './blockchain/blockchain.service';
import { BlockchainController } from './blockchain/blockchain.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BlockchainModule,
  ],
  controllers: [AppController, BlockchainController],
  providers: [AppService, BlockchainService],
})
export class AppModule {}
