import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
    // Moi tac vu nen trong repo (chot doi soat F13, chuyen trang thai chien dich F08, nhac het han F16)
    // deu dua vao mot lan forRoot nay. Truoc day no nam trong SettlementModule, nghia la go module doi
    // soat ra la toan bo cron tat im ma khong co loi nao bao ra.
    ScheduleModule.forRoot(),
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
