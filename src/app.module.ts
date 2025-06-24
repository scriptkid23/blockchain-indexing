import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlockchainModule } from './blockchain/blockchain.module';
import { BlockchainService } from './blockchain/blockchain.service';
import { BlockchainController } from './blockchain/blockchain.controller';
import { ChainConfigSeeder } from './blockchain/seeders/chain-config.seeder';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/blockchain-indexing',
        ),
      }),
      inject: [ConfigService],
    }),
    BlockchainModule,
  ],
  controllers: [AppController, BlockchainController],
  providers: [AppService, BlockchainService],
})
export class AppModule implements OnModuleInit {
  constructor(private chainConfigSeeder: ChainConfigSeeder) {}

  async onModuleInit() {
    // Seed chain configurations on startup
    await this.chainConfigSeeder.seed();
  }
}
