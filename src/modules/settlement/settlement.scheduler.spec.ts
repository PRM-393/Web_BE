// Unit test tac vu nen chot doi soat hang thang (F13 - T12).
// Chay bang: npm test
import { Logger } from '@nestjs/common';
import { SettlementScheduler } from './settlement.scheduler';
import { SettlementService } from './settlement.service';
import { vietnamMonthPeriod } from '../../common/utils/vn-time';

function buildScheduler(runMonthlySettlement: jest.Mock) {
  return new SettlementScheduler({ runMonthlySettlement } as unknown as SettlementService);
}

describe('FR-SETTLE-03 / BR-25 - moc ky tinh theo lich Viet Nam', () => {
  it('chay luc 01:00 ngay 01/02 gio VN thi chot ky thang 01, khong phai thang 12', () => {
    // 01:00 ngay 01/02/2026 gio VN = 18:00 ngay 31/01/2026 UTC. Ban cu dung new Date(nam, thang, ngay)
    // tren may chu UTC se doc ra "dang la thang 01" roi chot nham ky thang 12 nam truoc.
    const { periodStart, periodEnd } = vietnamMonthPeriod(new Date('2026-01-31T18:00:00.000Z'));

    // 00:00:00 ngay 01/01/2026 gio VN
    expect(periodStart.toISOString()).toBe('2025-12-31T17:00:00.000Z');
    // 23:59:59.999 ngay 31/01/2026 gio VN
    expect(periodEnd.toISOString()).toBe('2026-01-31T16:59:59.999Z');
  });

  it('sang nam moi thi lui dung ve thang 12 nam truoc', () => {
    // 01:00 ngay 01/01/2027 gio VN = 18:00 ngay 31/12/2026 UTC
    const { periodStart, periodEnd } = vietnamMonthPeriod(new Date('2026-12-31T18:00:00.000Z'));

    expect(periodStart.toISOString()).toBe('2026-11-30T17:00:00.000Z'); // 00:00 01/12/2026 gio VN
    expect(periodEnd.toISOString()).toBe('2026-12-31T16:59:59.999Z'); // 23:59:59.999 31/12/2026 gio VN
  });

  it('ky lien nhau khong ho va khong chong lan', () => {
    const thang01 = vietnamMonthPeriod(new Date('2026-01-31T18:00:00.000Z'));
    const thang02 = vietnamMonthPeriod(new Date('2026-02-28T18:00:00.000Z'));

    expect(thang02.periodStart.getTime() - thang01.periodEnd.getTime()).toBe(1);
  });
});

describe('FR-SETTLE-03 - tac vu nen chot doi soat', () => {
  it('goi service dung moc dau / cuoi ky cua thang truoc', async () => {
    const run = jest.fn().mockResolvedValue([]);
    await buildScheduler(run).handleMonthlySettlement();

    expect(run).toHaveBeenCalledTimes(1);
    const [periodStart, periodEnd] = run.mock.calls[0] as [Date, Date];
    const mong = vietnamMonthPeriod();
    expect(periodStart.toISOString()).toBe(mong.periodStart.toISOString());
    expect(periodEnd.toISOString()).toBe(mong.periodEnd.toISOString());
  });

  it('mot luot loi khong lam chet tien trinh, chay lai bang tay van duoc', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const run = jest.fn().mockRejectedValue(new Error('mat ket noi CSDL'));
    const scheduler = buildScheduler(run);

    await expect(scheduler.handleMonthlySettlement()).resolves.toBeUndefined();

    run.mockResolvedValue([]);
    await expect(scheduler.handleMonthlySettlement()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
