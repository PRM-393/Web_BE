import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SettlementService } from './settlement.service';

// UC-05: tac vu nen chay vao ngay dau thang duong lich
@Injectable()
export class SettlementScheduler {
  private readonly logger = new Logger(SettlementScheduler.name);

  constructor(private readonly settlementService: SettlementService) {}

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async handleMonthlySettlement() {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    this.logger.log(`Chay chot doi soat thang cho ky ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);
    await this.settlementService.runMonthlySettlement(periodStart, periodEnd);
  }
}
