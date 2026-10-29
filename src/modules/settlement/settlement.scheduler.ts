import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SettlementService } from './settlement.service';
import { vietnamMonthPeriod } from '../../common/utils/vn-time';
import { vietnamTimeString } from '../campaign/campaign.scheduler';

// Dat ten cho tac vu de SchedulerRegistry tra cuu duoc (test e2e kiem dung no da duoc dang ky).
// Thieu ten thi quen khai bao provider la cron chet lang, khong co loi nao bao ra.
export const SETTLEMENT_JOB = 'monthly-settlement';

// UC-05 / FR-SETTLE-03 / BR-25: chot doi soat luc 01:00 ngay 01 hang thang GIO VIET NAM.
//
// Ban cu dung CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT (00:00 gio may chu) va dung
// new Date(nam, thang, ngay) de dung moc ky. May chu Render chay UTC nen:
//   - job chay luc 07:00 gio VN ngay 01 thay vi 01:00, va
//   - moc ky dung theo lich UTC, lech han mot thang trong 7 gio dau moi ngay.
// Khai bao timeZone cho @Cron va dung vietnamMonthPeriod() de ca hai thu deu theo lich VN.
@Injectable()
export class SettlementScheduler {
  private readonly logger = new Logger(SettlementScheduler.name);

  constructor(private readonly settlementService: SettlementService) {}

  @Cron('0 1 1 * *', { name: SETTLEMENT_JOB, timeZone: 'Asia/Ho_Chi_Minh' })
  async handleMonthlySettlement() {
    const now = new Date();
    const { periodStart, periodEnd } = vietnamMonthPeriod(now);
    try {
      const created = await this.settlementService.runMonthlySettlement(periodStart, periodEnd);
      this.logger.log(
        `Chot doi soat luc ${vietnamTimeString(now)} cho ky ` +
          `${vietnamTimeString(periodStart)} - ${vietnamTimeString(periodEnd)}: ` +
          `sinh ${created.length} phieu`,
      );
    } catch (error) {
      // Mot luot loi khong duoc lam chet tien trinh. Chay lai bang tay qua
      // POST /api/admin/settlements/run khong sinh phieu trung (DC-06).
      this.logger.error(
        `Chot doi soat that bai luc ${vietnamTimeString(now)}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
