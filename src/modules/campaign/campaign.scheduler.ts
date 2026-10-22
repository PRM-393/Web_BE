import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CampaignService } from './campaign.service';

// BR-25 / CON-05: may chu Render khong chay mui gio Viet Nam. Moc thoi gian deu luu UTC nen viec so sanh
// trong job khong phu thuoc mui gio, nhung nhat ky thi phai in ra gio VN de con doi chieu voi nguoi dung.
export function vietnamTimeString(date: Date) {
  return `${new Date(date.getTime() + 7 * 3600000).toISOString().replace('T', ' ').slice(0, 19)} (GMT+7)`;
}

// Dat ten cho tac vu de SchedulerRegistry tra cuu duoc (test e2e kiem dung no da duoc dang ky)
export const CAMPAIGN_STATUS_JOB = 'campaign-status-transitions';

// FR-CAMP-10: tac vu nen 5 phut mot luot ra soat trang thai chien dich.
// Khai bao timeZone Asia/Ho_Chi_Minh cho dung BR-25: voi chu ky 5 phut thi moc chay nhu nhau o moi mui gio,
// nhung de san day de sau nay doi sang lich theo ngay thi khong ai quen mat.
@Injectable()
export class CampaignScheduler {
  private readonly logger = new Logger(CampaignScheduler.name);

  constructor(private readonly campaignService: CampaignService) {}

  @Cron('*/5 * * * *', { name: CAMPAIGN_STATUS_JOB, timeZone: 'Asia/Ho_Chi_Minh' })
  async handleStatusTransitions() {
    const now = new Date();
    try {
      const result = await this.campaignService.runStatusTransitions(now);
      const total = result.published + result.soldOut + result.restocked + result.ended;
      // Luot nao khong doi gi thi khong ghi nhat ky, tranh 288 dong rac moi ngay tren Render
      if (total > 0) {
        this.logger.log(
          `Ra soat trang thai chien dich luc ${vietnamTimeString(now)}: ` +
            `phat hanh ${result.published}, het hang ${result.soldOut}, ` +
            `co hang lai ${result.restocked}, ket thuc ${result.ended}`,
        );
      }
    } catch (error) {
      // Mot luot loi khong duoc lam chet tien trinh: luot sau (5 phut nua) se ra soat lai tu dau
      this.logger.error(
        `Ra soat trang thai chien dich that bai luc ${vietnamTimeString(now)}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
