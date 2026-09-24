import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Settlement } from '../../entities/settlement.entity';
import { SettlementItem } from '../../entities/settlement-item.entity';
import { SystemConfig } from '../../entities/system-config.entity';
import { Brand } from '../../entities/brand.entity';
import { Order } from '../../entities/order.entity';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';
import { SettlementScheduler } from './settlement.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([Settlement, SettlementItem, SystemConfig, Brand, Order]),
    ScheduleModule.forRoot(),
  ],
  controllers: [SettlementController],
  providers: [SettlementService, SettlementScheduler],
  exports: [SettlementService],
})
export class SettlementModule {}
