import { describe, it, expect } from 'vitest';
import type { ForecastDay } from '@/api/types';
import {
  buildBalanceChart,
  CHART_WIDTH,
  CHART_HEIGHT,
  CHART_INSET,
  spendBarHeight,
} from '@/lib/chart';

function day(date: string, runningBalance: string): ForecastDay {
  return { date, transactions: [], dailyNet: '0', runningBalance };
}

/** Days 1..n of August 2026 with the given balances. */
function august(balances: string[]): ForecastDay[] {
  return balances.map((b, i) => day(`2026-08-${String(i + 1).padStart(2, '0')}`, b));
}

const FLOOR = '1000';

describe('buildBalanceChart — x scale', () => {
  it('spreads points across the full width', () => {
    const g = buildBalanceChart({
      days: august(['1000', '900', '800']),
      todayDate: '2026-08-02',
      comfortFloor: FLOOR,
    });
    expect(g.points.map((p) => p.x)).toEqual([0, CHART_WIDTH / 2, CHART_WIDTH]);
  });

  it('places a single day at the origin rather than dividing by zero', () => {
    const g = buildBalanceChart({
      days: august(['1000']),
      todayDate: '2026-08-01',
      comfortFloor: FLOOR,
    });
    expect(g.points).toHaveLength(1);
    expect(g.points[0].x).toBe(0);
    expect(Number.isFinite(g.points[0].y)).toBe(true);
  });

  it('produces no geometry for an empty range', () => {
    const g = buildBalanceChart({ days: [], todayDate: '2026-08-15', comfortFloor: FLOOR });
    expect(g.points).toEqual([]);
    expect(g.settledPath).toBe('');
    expect(g.forecastPath).toBe('');
    expect(g.areaPath).toBe('');
    expect(g.lowPoint).toBeNull();
    expect(g.todayX).toBeNull();
  });
});

describe('buildBalanceChart — y scale', () => {
  it('keeps every point inside the inset plot band', () => {
    const g = buildBalanceChart({
      days: august(['3000', '1500', '250']),
      todayDate: '2026-08-02',
      comfortFloor: FLOOR,
    });
    for (const p of g.points) {
      expect(p.y).toBeGreaterThanOrEqual(CHART_INSET);
      expect(p.y).toBeLessThanOrEqual(CHART_HEIGHT - CHART_INSET);
    }
  });

  it('puts the highest balance nearest the top', () => {
    const g = buildBalanceChart({
      days: august(['3000', '1500', '250']),
      todayDate: '2026-08-02',
      comfortFloor: FLOOR,
    });
    expect(g.points[0].y).toBeLessThan(g.points[1].y);
    expect(g.points[1].y).toBeLessThan(g.points[2].y);
  });

  it('anchors an all-positive series to a zero baseline', () => {
    const g = buildBalanceChart({
      days: august(['1000', '0']),
      todayDate: '2026-08-01',
      comfortFloor: FLOOR,
    });
    expect(g.points[1].y).toBe(CHART_HEIGHT - CHART_INSET);
  });

  it('keeps a negative balance inside the plot band', () => {
    // The handoff's lo = min(0, min × 0.9) shrinks a negative minimum toward
    // zero, which would put the lowest point below the chart floor.
    const g = buildBalanceChart({
      days: august(['1000', '-500']),
      todayDate: '2026-08-01',
      comfortFloor: FLOOR,
    });
    expect(g.points[1].y).toBeLessThanOrEqual(CHART_HEIGHT - CHART_INSET);
    expect(g.points[1].y).toBeGreaterThan(g.points[0].y);
  });

  it('keeps an all-negative series inside the plot band', () => {
    const g = buildBalanceChart({
      days: august(['-100', '-500']),
      todayDate: '2026-08-01',
      comfortFloor: FLOOR,
    });
    for (const p of g.points) {
      expect(p.y).toBeGreaterThanOrEqual(CHART_INSET);
      expect(p.y).toBeLessThanOrEqual(CHART_HEIGHT - CHART_INSET);
    }
  });

  it('pins a flat series to the vertical midpoint rather than dividing by zero', () => {
    const g = buildBalanceChart({
      days: august(['0', '0', '0']),
      todayDate: '2026-08-02',
      comfortFloor: '0',
    });
    for (const p of g.points) {
      expect(p.y).toBe(CHART_HEIGHT / 2);
    }
  });
});

describe('buildBalanceChart — settled and forecast segments', () => {
  const days = august(['3000', '2500', '2000', '1500', '1000']);

  it('splits at today and shares the today point so the line stays continuous', () => {
    const g = buildBalanceChart({ days, todayDate: '2026-08-03', comfortFloor: FLOOR });
    const settledEnd = g.settledPath.trim().split('L').pop()?.trim();
    const forecastStart = g.forecastPath.trim().replace(/^M/, '').split('L')[0].trim();
    expect(settledEnd).toBe(forecastStart);
  });

  it('runs the settled segment from the first day through today', () => {
    const g = buildBalanceChart({ days, todayDate: '2026-08-03', comfortFloor: FLOOR });
    // Days 1, 2, 3 — one move plus two lines.
    expect(g.settledPath.match(/L/g)).toHaveLength(2);
  });

  it('runs the forecast segment from today through the last day', () => {
    const g = buildBalanceChart({ days, todayDate: '2026-08-03', comfortFloor: FLOOR });
    // Days 3, 4, 5 — one move plus two lines.
    expect(g.forecastPath.match(/L/g)).toHaveLength(2);
  });

  it('treats a wholly past month as entirely settled', () => {
    const g = buildBalanceChart({ days, todayDate: '2026-09-10', comfortFloor: FLOOR });
    expect(g.forecastPath).toBe('');
    expect(g.settledPath).not.toBe('');
    expect(g.todayX).toBeNull();
  });

  it('treats a wholly future month as entirely forecast', () => {
    const g = buildBalanceChart({ days, todayDate: '2026-07-10', comfortFloor: FLOOR });
    expect(g.settledPath).toBe('');
    expect(g.forecastPath).not.toBe('');
    expect(g.todayX).toBeNull();
  });

  it('marks the today divider when today falls inside the range', () => {
    const g = buildBalanceChart({ days, todayDate: '2026-08-03', comfortFloor: FLOOR });
    expect(g.todayX).toBe(CHART_WIDTH / 2);
  });

  it('falls back to the last settled day when today has no entry of its own', () => {
    const sparse = [day('2026-08-01', '3000'), day('2026-08-05', '2000')];
    const g = buildBalanceChart({ days: sparse, todayDate: '2026-08-03', comfortFloor: FLOOR });
    expect(g.todayX).toBe(0);
  });
});

describe('buildBalanceChart — area, floor and band', () => {
  const days = august(['3000', '2000', '1000']);

  it('closes the area path along the bottom of the chart', () => {
    const g = buildBalanceChart({ days, todayDate: '2026-08-02', comfortFloor: FLOOR });
    expect(g.areaPath.endsWith('Z')).toBe(true);
    expect(g.areaPath).toContain(`${CHART_HEIGHT}`);
  });

  it('places the comfort floor line and runs the warning band to the bottom', () => {
    const g = buildBalanceChart({ days, todayDate: '2026-08-02', comfortFloor: FLOOR });
    expect(g.floorY).not.toBeNull();
    expect(g.bandY).toBe(g.floorY);
    expect((g.bandY as number) + (g.bandHeight as number)).toBe(CHART_HEIGHT);
  });

  it('clamps a comfort floor above the whole series to the top of the chart', () => {
    const g = buildBalanceChart({ days, todayDate: '2026-08-02', comfortFloor: '99999' });
    expect(g.floorY).toBe(0);
    expect(g.bandHeight).toBe(CHART_HEIGHT);
  });

  it('clamps a comfort floor below the whole series to the bottom of the chart', () => {
    const g = buildBalanceChart({ days, todayDate: '2026-08-02', comfortFloor: '-99999' });
    expect(g.floorY).toBe(CHART_HEIGHT);
    expect(g.bandHeight).toBe(0);
  });
});

describe('buildBalanceChart — low point marker', () => {
  it('marks the minimum balance', () => {
    const days = august(['3000', '836.69', '1200']);
    const g = buildBalanceChart({ days, todayDate: '2026-08-02', comfortFloor: FLOOR });
    expect(g.lowPoint).toEqual({ x: g.points[1].x, y: g.points[1].y });
  });

  it('marks the earliest of tied minimums', () => {
    const days = august(['2000', '500', '500']);
    const g = buildBalanceChart({ days, todayDate: '2026-08-02', comfortFloor: FLOOR });
    expect(g.lowPoint?.x).toBe(g.points[1].x);
  });

  it('compares by decimal value rather than string order', () => {
    const days = august(['10.00', '9.00']);
    const g = buildBalanceChart({ days, todayDate: '2026-08-01', comfortFloor: '0' });
    expect(g.lowPoint?.x).toBe(g.points[1].x);
  });
});

describe('spendBarHeight', () => {
  it('gives no bar to a day with no spend', () => {
    expect(spendBarHeight(0)).toBe(0);
  });

  it('gives the heaviest day the full height', () => {
    expect(spendBarHeight(1)).toBe(24);
  });

  it('scales proportionally in between', () => {
    expect(spendBarHeight(0.5)).toBe(12);
  });

  it('floors a tiny spend at three pixels so it stays visible', () => {
    expect(spendBarHeight(0.01)).toBe(3);
    expect(spendBarHeight(0.0001)).toBe(3);
  });

  it('treats a negative intensity as no spend rather than an inverted bar', () => {
    expect(spendBarHeight(-1)).toBe(0);
  });
});
