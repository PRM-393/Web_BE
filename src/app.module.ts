import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from './config/typeorm.config';
import { EntitiesModule } from './entities/entities.module';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { BrandModule } from './modules/brand/brand.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { SearchModule } from './modules/search/search.module';
import { OrderModule } from './modules/order/order.module';
import { RedeemModule } from './modules/redeem/redeem.module';
import { RefundModule } from './modules/refund/refund.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { ReportModule } from './modules/report/report.module';
import { EngageModule } from './modules/engage/engage.module';
import { ProfileModule } from './modules/profile/profile.module';
import { NotificationModule } from './modules/notification/notification.module';
import { WalletModule } from './modules/wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
    TypeOrmModule.forRootAsync({
      useFactory: databaseConfig,
    }),
    EntitiesModule,
    AuthModule,
    BrandModule,
    CampaignModule,
    SearchModule,
    OrderModule,
    RedeemModule,
    RefundModule,
    SettlementModule,
    ReportModule,
    EngageModule,
    ProfileModule,
    NotificationModule,
    WalletModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
