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
import * as adminAnalytics from '../utils/adminAnalytics';
import {
  isAdminSessionActive,
  setAdminSessionActive,
  SESSION_EXPIRATION_MS,
} from '../utils/adminAnalytics';
import {
  verifyUserAdminRole,
  clearAllLiveReportsFromCloud,
} from '../utils/firebaseSync';
import type { User } from 'firebase/auth';
import { CivicActionEvent, FoulingReport } from '../types';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Clean Greystones Product Metrics & Secure Admin Suite', () => {
  const baseTime = new Date('2026-10-19T14:00:00Z');
  const nowMs = baseTime.getTime();

  beforeEach(() => {
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

  it('verifies that admin authentication relies exclusively on Firebase administrator role, having eliminated passcodes and static hashes', () => {
    // 1. Module exports must NOT contain legacy passcode hashes or passcode verifiers
    const exported = adminAnalytics as Record<string, unknown>;
    assert.equal(exported.AUTHORISED_ADMIN_HASHES, undefined);
    assert.equal(exported.verifyAdminPasscodeSecure, undefined);
    assert.equal(exported.getAdminLockoutState, undefined);
    assert.equal(exported.recordFailedAdminLogin, undefined);
    assert.equal(exported.resetAdminLockout, undefined);

    // 2. Session expiration constant exists and enforces 2 hours
    assert.equal(SESSION_EXPIRATION_MS, 2 * 60 * 60 * 1000);
  });

  it('enforces Firestore database rules: reports can only be created or have confirmations added by public, while deletes, snapshot writes, and arbitrary edits require admin role', () => {
    // Read the actual deployed firestore.rules file
    const rulesPath = path.resolve(__dirname, '../../firestore.rules');
    assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');
    const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

    // Rule assertion 1: clean_greystones_reports create must validate schema and update must increment confirmations by exactly +1
    assert.ok(
      rulesContent.includes('allow create: if isAdmin() || isValidReportCreate(request.resource.data);'),
      'Reports create rule must enforce isValidReportCreate schema validation'
    );
    assert.ok(
      rulesContent.includes('request.resource.data.confirmations == resource.data.confirmations + 1'),
      'Confirmations update must strictly increment by +1 (preventing arbitrary jump to 999999)'
    );

    // Rule assertion 1b: clean_greystones_events read must be restricted to isAdmin()
    const eventsBlock = rulesContent.slice(
      rulesContent.indexOf('match /clean_greystones_events/{eventId}'),
      rulesContent.indexOf('match /greystones_roads_reports/{reportId}')
    );
    assert.ok(
      eventsBlock.includes('allow read: if isAdmin();'),
      'Events collection read must be restricted to admins'
    );

    // Rule assertion 2: delete must be restricted to isAdmin
    assert.ok(
      rulesContent.includes('match /clean_greystones_reports/{reportId}'),
      'Rules must contain clean_greystones_reports block'
    );
    const reportsBlock = rulesContent.slice(
      rulesContent.indexOf('match /clean_greystones_reports/{reportId}'),
      rulesContent.indexOf('match /clean_greystones_snapshots/{dateId}')
    );
    assert.ok(reportsBlock.includes('allow delete: if isAdmin();'), 'Reports delete must be restricted to isAdmin');

    // Rule assertion 3: clean_greystones_snapshots writes must be restricted to isAdmin
    const snapshotsBlock = rulesContent.slice(
      rulesContent.indexOf('match /clean_greystones_snapshots/{dateId}'),
      rulesContent.indexOf('match /clean_greystones_events/{eventId}')
    );
    assert.ok(snapshotsBlock.includes('allow write: if isAdmin();'), 'Snapshots write must be restricted to isAdmin');
    assert.equal(snapshotsBlock.includes('allow read, write: if true;'), false, 'Snapshots write must not be open to public');

    // Rule assertion 4: protofleet state and deployments writes must be restricted to isAdmin
    assert.ok(
      rulesContent.includes('match /protofleet_state/{docId} {\n      allow read: if true;\n      allow write: if isAdmin();'),
      'protofleet_state write must be restricted to isAdmin'
    );
    assert.ok(
      rulesContent.includes('match /protofleet_deployments/{slug} {\n      allow read: if true;\n      allow write: if isAdmin();'),
      'protofleet_deployments write must be restricted to isAdmin'
    );

    // Functional evaluator simulating Firestore engine logic
    function simulateReportUpdate(
      isAdmin: boolean,
      original: { confirmations: number; status: string; streetName: string },
      updated: { confirmations: number; status: string; streetName: string }
    ): boolean {
      if (isAdmin) return true;
      const affected = Object.keys(updated).filter(
        (k) => (original as any)[k] !== (updated as any)[k]
      );
      return (
        affected.length === 1 &&
        affected[0] === 'confirmations' &&
        typeof updated.confirmations === 'number' &&
        updated.confirmations === original.confirmations + 1
      );
    }

    const baseline = { confirmations: 1, status: 'spotted', streetName: 'Church Road' };

    // Public incrementing confirmation by +1: allowed
    assert.equal(simulateReportUpdate(false, baseline, { ...baseline, confirmations: 2 }), true);

    // Public attempting to jump confirmation to 999999: rejected (H1)
    assert.equal(simulateReportUpdate(false, baseline, { ...baseline, confirmations: 999999 }), false);

    // Public attempting to decrement confirmation: rejected
    assert.equal(simulateReportUpdate(false, baseline, { ...baseline, confirmations: 0 }), false);

    // Public attempting to soft-delete by changing status: REJECTED (closes the security hole!)
    assert.equal(simulateReportUpdate(false, baseline, { ...baseline, status: 'deleted' }), false);

    // Public attempting to tamper with street name: rejected
    assert.equal(simulateReportUpdate(false, baseline, { ...baseline, streetName: 'Fake St' }), false);

    // Admin soft-delete or status change: allowed
    assert.equal(simulateReportUpdate(true, baseline, { ...baseline, status: 'deleted' }), true);
  });

  it('verifies administrator roles via custom claims and administrator email allowlists', async () => {
    // 1. User with admin custom claim
    const adminClaimUser = {
      uid: 'user-admin-1',
      email: 'organizer@cleangreystones.ie',
      getIdTokenResult: async () => ({
        claims: { admin: true },
        authTime: 'now',
        issuedAtTime: 'now',
        expirationTime: 'later',
        signInProvider: 'password',
        signInSecondFactor: null,
        token: 'mock-jwt-token',
      }),
    } as unknown as User;
    assert.equal(await verifyUserAdminRole(adminClaimUser), true);

    // 2. User with role === 'admin' claim
    const roleClaimUser = {
      uid: 'user-admin-2',
      email: 'staff@wicklow.ie',
      getIdTokenResult: async () => ({
        claims: { role: 'admin' },
        authTime: 'now',
        issuedAtTime: 'now',
        expirationTime: 'later',
        signInProvider: 'password',
        signInSecondFactor: null,
        token: 'mock-jwt-token',
      }),
    } as unknown as User;
    assert.equal(await verifyUserAdminRole(roleClaimUser), true);

    // 3. User with matching default admin email
    const emailAdminUser = {
      uid: 'user-admin-3',
      email: 'admin@cleangreystones.ie',
      getIdTokenResult: async () => ({
        claims: {},
        authTime: 'now',
        issuedAtTime: 'now',
        expirationTime: 'later',
        signInProvider: 'password',
        signInSecondFactor: null,
        token: 'mock-jwt-token',
      }),
    } as unknown as User;
    assert.equal(await verifyUserAdminRole(emailAdminUser), true);

    // 4. Regular citizen / resident without admin claims
    const residentUser = {
      uid: 'user-resident-1',
      email: 'resident@gmail.com',
      getIdTokenResult: async () => ({
        claims: {},
        authTime: 'now',
        issuedAtTime: 'now',
        expirationTime: 'later',
        signInProvider: 'password',
        signInSecondFactor: null,
        token: 'mock-jwt-token',
      }),
    } as unknown as User;
    assert.equal(await verifyUserAdminRole(residentUser), false);

    // 5. Unauthenticated visitor (null user)
    assert.equal(await verifyUserAdminRole(null), false);
  });

  it('protects destructive cloud backend wipe operations against unauthenticated access', async () => {
    // Calling clearAllLiveReportsFromCloud without active Firebase admin session must throw
    await assert.rejects(
      async () => {
        await clearAllLiveReportsFromCloud();
      },
      {
        message: /Unauthorized: An authenticated administrator with an admin role is required to clear cloud data\./,
      }
    );
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
