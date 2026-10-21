import { reportRange, vietnamDate } from './report.service';
import { distanceKm } from '../search/search.service';

describe('report calendar and geographic boundaries', () => {
  it('date-only filters cover a complete Vietnam calendar day in UTC', () => {
    const range = reportRange({ from: '2026-10-20', to: '2026-10-20' });
    expect(range.from!.toISOString()).toBe('2026-10-19T17:00:00.000Z');
    expect(range.to!.toISOString()).toBe('2026-10-20T16:59:59.999Z');
  });
  it('daily grouping crosses midnight in Vietnam, independently of host timezone', () => {
    expect(vietnamDate(new Date('2026-10-19T17:00:00Z'))).toBe('2026-10-20');
    expect(vietnamDate(new Date('2026-10-19T16:59:59Z'))).toBe('2026-10-19');
  });
  it('preserves exact timestamp filters and rejects reversed intervals', () => {
    expect(reportRange({ from: '2026-10-20T12:00:00Z' }).from!.toISOString()).toBe('2026-10-20T12:00:00.000Z');
    expect(() => reportRange({ from: '2026-10-21', to: '2026-10-20' })).toThrow();
  });
  it('Haversine handles colocated stores and known equatorial distance', () => {
    expect(distanceKm(10.8, 106.7, 10.8, 106.7)).toBe(0);
    expect(distanceKm(0, 0, 0, 1)).toBeCloseTo(111.195, 2);
    expect(Number.isFinite(distanceKm(0, 0, 0, 180))).toBe(true);
  });
});
