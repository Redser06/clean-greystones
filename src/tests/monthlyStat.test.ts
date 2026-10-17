import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { headlineStat, monthlyReportStat, trendSentence } from '../lib/monthlyStat';

describe('monthly report stat', () => {
  const now = new Date('2026-10-17T12:00:00Z');

  it('counts this month and the change from last month', () => {
    const stat = monthlyReportStat(
      [
        { createdAt: '2026-10-02T12:00:00Z' },
        { createdAt: '2026-10-16T23:30:00Z' },
        { createdAt: '2026-09-30T12:00:00Z' },
        { createdAt: '2026-08-01T12:00:00Z' },
      ],
      now,
    );
    assert.deepEqual(stat, { thisMonth: 2, lastMonth: 1, delta: 1 });
    assert.equal(headlineStat(stat), "You've logged 2 reports this month");
    assert.equal(trendSentence(stat), '1 more report than last month');
  });

  it('describes a drop and a flat month', () => {
    const down = monthlyReportStat(
      [{ createdAt: '2026-09-03T12:00:00Z' }, { createdAt: '2026-09-04T12:00:00Z' }],
      now,
    );
    assert.equal(down.delta, -2);
    assert.equal(trendSentence(down), '2 fewer reports than last month');
    assert.equal(headlineStat(down), "You've logged 0 reports this month");

    const flat = monthlyReportStat([], now);
    assert.deepEqual(flat, { thisMonth: 0, lastMonth: 0, delta: 0 });
    assert.equal(trendSentence(flat), 'You logged none last month either');

    const same = monthlyReportStat(
      [{ createdAt: '2026-10-02T12:00:00Z' }, { createdAt: '2026-09-02T12:00:00Z' }],
      now,
    );
    assert.equal(trendSentence(same), 'The same as last month');
  });

  it('uses a singular noun for one report', () => {
    const stat = monthlyReportStat([{ createdAt: '2026-10-01T00:30:00Z' }], now);
    assert.equal(headlineStat(stat), "You've logged 1 report this month");
  });

  it('uses Irish civil time for the month boundary', () => {
    const stillSeptember = monthlyReportStat([{ createdAt: '2026-09-30T21:30:00Z' }], now, 'Europe/Dublin');
    assert.equal(stillSeptember.lastMonth, 1);
    assert.equal(stillSeptember.thisMonth, 0);

    const alreadyOctober = monthlyReportStat([{ createdAt: '2026-09-30T23:30:00Z' }], now, 'Europe/Dublin');
    assert.equal(alreadyOctober.thisMonth, 1);
    assert.equal(alreadyOctober.lastMonth, 0);
  });
});
