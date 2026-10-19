import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// In Node.js test environment, polyfill sessionStorage for unit tests
class MemoryStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

if (typeof globalThis.window === 'undefined') {
  const memStore = new MemoryStorage();
  (globalThis as any).window = {
    sessionStorage: memStore,
    location: { href: 'http://localhost/' },
  };
  (globalThis as any).sessionStorage = memStore;
}

import { computeProductMetrics } from '../utils/productMetrics';
import {
  verifyAdminPasscodeSecure,
  isAdminSessionActive,
  setAdminSessionActive,
  getAdminLockoutState,
  recordFailedAdminLogin,
  resetAdminLockout,
} from '../utils/adminAnalytics';
import { CivicActionEvent, FoulingReport } from '../types';

describe('Clean Greystones Product Metrics & Secure Admin Suite', () => {
  const baseTime = new Date('2026-10-19T14:00:00Z');
  const nowMs = baseTime.getTime();

  beforeEach(() => {
    resetAdminLockout();
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }
  });

  const mockReports: FoulingReport[] = [
    {
      id: 'rep-1',
      createdAt: new Date(nowMs - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago (Today)
      lat: 53.1443,
      lng: -6.0604,
      accuracyM: 2.0,
      streetName: 'South Beach Promenade',
      areaName: 'South Beach',
      h3Cell: '881f185293fffff',
      severity: 'wheelchair_wheels',
      status: 'spotted',
      confirmations: 2,
      submitterToken: 'GS-ANON-1111-2222',
      additionalSubmitters: ['GS-ANON-3333-4444'],
      nearestBinId: 'bin-1',
      nearestBinCode: 'G-14',
      dBinAllM: 8,
      dBinVerifiedM: 8,
    },
    {
      id: 'rep-2',
      createdAt: new Date(nowMs - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago (This week)
      lat: 53.1460,
      lng: -6.0620,
      accuracyM: 3.0,
      streetName: 'Church Road',
      areaName: 'Town Centre',
      h3Cell: '881f185295fffff',
      severity: 'just_poop',
      status: 'spotted',
      confirmations: 1,
      submitterToken: 'GS-ANON-5555-6666',
      nearestBinId: 'bin-2',
      nearestBinCode: 'G-02',
      dBinAllM: 22,
      dBinVerifiedM: 22,
    },
    {
      id: 'rep-3',
      createdAt: new Date(nowMs - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago (This month, outside week)
      lat: 53.1410,
      lng: -6.0700,
      accuracyM: 2.5,
      streetName: 'Charlesland Spine Path',
      areaName: 'Charlesland',
      h3Cell: '881f185291fffff',
      severity: 'stepped_in',
      status: 'spotted',
      confirmations: 1,
      submitterToken: 'GS-ANON-7777-8888',
      nearestBinId: 'bin-3',
      nearestBinCode: 'G-08',
      dBinAllM: 910,
      dBinVerifiedM: 910,
    },
  ];

  const mockEvents: CivicActionEvent[] = [
    {
      id: 'evt-1',
      type: 'email_council_mailto',
      submitterToken: 'GS-ANON-1111-2222',
      timestamp: new Date(nowMs - 1 * 60 * 60 * 1000).toISOString(),
      metadata: { targetButton: 'mailto', templateId: 'practical_action' },
    },
    {
      id: 'evt-2',
      type: 'email_council_copy',
      submitterToken: 'GS-ANON-3333-4444',
      timestamp: new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { targetButton: 'copy', templateId: 'bin_mythbuster' },
    },
    {
      id: 'evt-3',
      type: 'email_council_gmail',
      submitterToken: 'GS-ANON-1111-2222',
      timestamp: new Date(nowMs - 30 * 60 * 1000).toISOString(),
      metadata: { targetButton: 'gmail', templateId: 'wheel_contamination' },
    },
  ];

  it('computes accurate DAU, WAU, MAU, and unique resident device tokens', () => {
    const metrics = computeProductMetrics(mockReports, mockEvents, baseTime);

    // Active in past 24h: GS-ANON-1111-2222, GS-ANON-3333-4444
    assert.equal(metrics.dau, 2);

    // Active in past 7d: + GS-ANON-5555-6666
    assert.equal(metrics.wau, 3);

    // Active in past 30d: + GS-ANON-7777-8888
    assert.equal(metrics.mau, 4);
    assert.equal(metrics.totalUniqueTokens, 4);
  });

  it('computes email ledger, action button breakdown, and council conversion rate', () => {
    const metrics = computeProductMetrics(mockReports, mockEvents, baseTime);

    assert.equal(metrics.totalEmailClicks, 3);
    assert.equal(metrics.mailtoClicks, 1);
    assert.equal(metrics.copyClicks, 1);
    assert.equal(metrics.gmailClicks, 1);

    // Unique email senders: GS-ANON-1111-2222 and GS-ANON-3333-4444 = 2 senders out of 4 total tokens (50%)
    assert.equal(metrics.uniqueEmailSenders, 2);
    assert.equal(metrics.emailConversionRate, 50);

    // Ledger sorted newest first
    assert.equal(metrics.emailLedger.length, 3);
    assert.equal(metrics.emailLedger[0].id, 'evt-3'); // 30 mins ago
    assert.equal(metrics.emailLedger[1].id, 'evt-1'); // 1 hour ago
    assert.equal(metrics.emailLedger[2].id, 'evt-2'); // 2 days ago
  });

  it('computes 14-day daily poos time series, bin proximity, and corroboration stats', () => {
    const metrics = computeProductMetrics(mockReports, mockEvents, baseTime);

    assert.equal(metrics.dailyPoos.length, 14);
    assert.equal(metrics.totalPoosLogged, 4); // 2 + 1 + 1

    // Bin proximity (<=50m): rep-1 (8m) and rep-2 (22m) = 2 out of 3 = 67%
    assert.equal(metrics.nearBin50mPct, 67);

    // Corroboration rate: rep-1 has confirmations=2 = 1 out of 3 = 33%
    assert.equal(metrics.corroborationRate, 33);

    // High impact (wheels / stepped in): rep-1 (wheelchair) + rep-3 (stepped in) = 2 out of 3 = 67%
    assert.equal(metrics.highImpactPct, 67);
  });

  it('verifies authorised admin passcodes securely via SHA-256 hashes', async () => {
    // Valid passcodes
    const res1 = await verifyAdminPasscodeSecure('GREYSTONES-MD-2026');
    assert.equal(res1.ok, true);

    const res2 = await verifyAdminPasscodeSecure('GREYSTONES-ROADS-2026');
    assert.equal(res2.ok, true);

    // Invalid passcode
    const badRes = await verifyAdminPasscodeSecure('wrong-passcode');
    assert.equal(badRes.ok, false);
  });

  it('enforces brute-force lockout after 5 consecutive failed login attempts', async () => {
    resetAdminLockout();
    assert.equal(getAdminLockoutState().isLocked, false);

    // 4 failed attempts: not locked yet
    for (let i = 0; i < 4; i++) {
      recordFailedAdminLogin();
      assert.equal(getAdminLockoutState().isLocked, false);
    }

    // 5th failed attempt: triggers 15-minute lockout
    recordFailedAdminLogin();
    const lockedState = getAdminLockoutState();
    assert.equal(lockedState.isLocked, true);
    assert.ok(lockedState.remainingMs > 0);

    // Attempting login while locked immediately fails
    const failWhileLocked = await verifyAdminPasscodeSecure('GREYSTONES-MD-2026');
    assert.equal(failWhileLocked.ok, false);
    assert.ok(failWhileLocked.error?.includes('lockout active'));

    resetAdminLockout();
  });

  it('manages expiring 2-hour admin sessions safely without keeping plaintext secrets', () => {
    setAdminSessionActive(true);
    assert.equal(isAdminSessionActive(), true);

    // Verify session object format in storage
    const sessionRaw = window.sessionStorage.getItem('greystones_civic_common_admin_session_v2');
    assert.ok(sessionRaw !== null);
    const session = JSON.parse(sessionRaw!);
    assert.equal(session.authenticated, true);
    assert.ok(session.expiresAt > Date.now());

    // Expired session is evicted
    window.sessionStorage.setItem(
      'greystones_civic_common_admin_session_v2',
      JSON.stringify({ authenticated: true, expiresAt: Date.now() - 1000 })
    );
    window.sessionStorage.removeItem('greystones_civic_common_admin_session_v1');
    assert.equal(isAdminSessionActive(), false);
  });
});
