import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Settlement } from '../../entities/settlement.entity';
import { SettlementItem } from '../../entities/settlement-item.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { Brand } from '../../entities/brand.entity';
import { Order } from '../../entities/order.entity';
import { VoucherItem } from '../../entities/voucher-item.entity';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';
import { SettlementScheduler } from './settlement.scheduler';

@Module({
  imports: [
    // EntitiesModule la @Global nen cac repo deu inject duoc, van khai bao day du cho de doc
    // ScheduleModule.forRoot() da chuyen len app.module.ts de moi cron khong phu thuoc vao module nay
    TypeOrmModule.forFeature([Settlement, SettlementItem, SystemConfig, AuditLog, Brand, Order, VoucherItem]),
  ],
  controllers: [SettlementController],
  providers: [SettlementService, SettlementScheduler],
  exports: [SettlementService],
})
export class SettlementModule {}
