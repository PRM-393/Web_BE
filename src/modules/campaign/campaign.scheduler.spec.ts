// Unit test tac vu nen chuyen trang thai chien dich (F08 - T4).
// Chay bang: npm test
import { Logger } from '@nestjs/common';
import { CampaignScheduler, vietnamTimeString } from './campaign.scheduler';
import { CampaignService } from './campaign.service';

function buildScheduler(runStatusTransitions: jest.Mock) {
  return new CampaignScheduler({ runStatusTransitions } as unknown as CampaignService);
}

describe('BR-25 - nhat ky job in theo gio Asia/Ho_Chi_Minh', () => {
  it('doi moc UTC sang gio Viet Nam, ke ca khi sang ngay moi', () => {
    // 21/10 luc 17:30 UTC la 00:30 ngay 22/10 o Viet Nam - may chu Render chay UTC nen rat de in nham ngay
    expect(vietnamTimeString(new Date('2026-10-21T17:30:00.000Z'))).toBe('2026-10-22 00:30:00 (GMT+7)');
  });
});

describe('FR-CAMP-10 - lich chay 5 phut mot luot', () => {
  it('goi dung ham ra soat trang thai voi thoi diem hien tai', async () => {
    const run = jest.fn().mockResolvedValue({ published: 1, soldOut: 0, restocked: 0, ended: 0 });
    await buildScheduler(run).handleStatusTransitions();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it('mot luot loi khong lam chet tien trinh, luot sau van chay lai', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const run = jest.fn().mockRejectedValue(new Error('mat ket noi CSDL'));
    const scheduler = buildScheduler(run);
    await expect(scheduler.handleStatusTransitions()).resolves.toBeUndefined();

    run.mockResolvedValue({ published: 0, soldOut: 0, restocked: 0, ended: 0 });
    await expect(scheduler.handleStatusTransitions()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
