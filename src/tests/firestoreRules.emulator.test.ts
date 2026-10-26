import { describe, it, before, after, beforeEach } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  Timestamp,
  setLogLevel,
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rulesPath = path.resolve(__dirname, '../../firestore.rules');

describe('Firestore Security Rules Emulator Suite (PR #21 Review Hardening)', () => {
  let testEnv: RulesTestEnvironment;

  before(async () => {
    setLogLevel('error');
    const rules = fs.readFileSync(rulesPath, 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-clean-greystones',
      firestore: {
        rules,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  function validReportPayload(reportId: string, ownerUid: string) {
    return {
      id: reportId,
      ownerUid,
      createdAt: serverTimestamp(),
      lat: 53.1443,
      lng: -6.0604,
      accuracyM: 2.4,
      streetName: 'South Beach Promenade',
      areaName: 'South Beach Prom',
      h3Cell: '881f185293fffff',
      severity: 'just_poop',
      status: 'spotted',
      confirmations: 1,
      submitterToken: 'GS-ANON-1111-2222',
      additionalSubmitters: [],
      nearestBinId: 'bin-14',
      nearestBinCode: 'Bin #G-14',
      dBinAllM: 8,
      dBinVerifiedM: 8,
      hasPhoto: false,
    };
  }

  function validEventPayload(eventId: string, ownerUid: string) {
    return {
      id: eventId,
      ownerUid,
      createdAt: serverTimestamp(),
      type: 'report_logged',
      submitterToken: 'GS-ANON-1111-2222',
      timestamp: '2026-10-26T12:00:00.000Z',
      metadata: {
        reportId: 'rep-100',
        streetName: 'South Beach Promenade',
        nearestBinCode: 'Bin #G-14',
      },
    };
  }

  it('Fix 3 & 4 (Creates): allows valid report and event creates and denies extra keys, future createdAt, oversized fields, or non-JPEG data URLs', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-uid-1').firestore();

    // ALLOW: valid report create with serverTimestamp and ownerUid == request.auth.uid
    await assertSucceeds(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-valid-1'), validReportPayload('rep-valid-1', 'owner-uid-1'))
    );

    // ALLOW: valid report create with JPEG data URL
    await assertSucceeds(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-valid-jpeg'), {
        ...validReportPayload('rep-valid-jpeg', 'owner-uid-1'),
        hasPhoto: true,
        photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
        note: 'Beside the lifeguard hut',
      })
    );

    // ALLOW: valid event create
    await assertSucceeds(
      setDoc(doc(ownerDb, 'clean_greystones_events', 'evt-valid-1'), validEventPayload('evt-valid-1', 'owner-uid-1'))
    );

    // DENY: report create with extra/unknown keys (e.g. isSeededDemo, role, verified)
    await assertFails(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-extra-key'), {
        ...validReportPayload('rep-extra-key', 'owner-uid-1'),
        isSeededDemo: true,
      })
    );

    // DENY: event create with extra/unknown keys
    await assertFails(
      setDoc(doc(ownerDb, 'clean_greystones_events', 'evt-extra-key'), {
        ...validEventPayload('evt-extra-key', 'owner-uid-1'),
        injectedFlag: true,
      })
    );

    // DENY: report create with future createdAt (must equal request.time)
    await assertFails(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-future-time'), {
        ...validReportPayload('rep-future-time', 'owner-uid-1'),
        createdAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      })
    );

    // DENY: report create with mismatched ownerUid
    await assertFails(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-wrong-owner'), {
        ...validReportPayload('rep-wrong-owner', 'someone-else-uid'),
      })
    );

    // DENY: report create with oversized note (>140 chars) or oversized streetName (>120 chars)
    await assertFails(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-oversized-note'), {
        ...validReportPayload('rep-oversized-note', 'owner-uid-1'),
        note: 'A'.repeat(141),
      })
    );
    await assertFails(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-oversized-street'), {
        ...validReportPayload('rep-oversized-street', 'owner-uid-1'),
        streetName: 'S'.repeat(121),
      })
    );

    // DENY: report create with non-JPEG photoDataUrl (PNG / TIFF / HEIC) or oversized JPEG (>350KB)
    await assertFails(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-png-photo'), {
        ...validReportPayload('rep-png-photo', 'owner-uid-1'),
        hasPhoto: true,
        photoDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
      })
    );
    await assertFails(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-tiff-photo'), {
        ...validReportPayload('rep-tiff-photo', 'owner-uid-1'),
        hasPhoto: true,
        photoDataUrl: 'data:image/tiff;base64,SUkqAAgAAAAO',
      })
    );
    await assertFails(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-oversized-photo'), {
        ...validReportPayload('rep-oversized-photo', 'owner-uid-1'),
        hasPhoto: true,
        photoDataUrl: `data:image/jpeg;base64,${'A'.repeat(350000)}`,
      })
    );
    await assertFails(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-oob-coords'), {
        ...validReportPayload('rep-oob-coords', 'owner-uid-1'),
        lat: 55.0,
      })
    );
  });

  it('Fix 1 (Corroboration): allows valid +1 corroboration with severity escalation and denies note edits, severity de-escalation, or submitter padding', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-uid-1').firestore();
    const strangerDb = testEnv.authenticatedContext('stranger-uid-2').firestore();

    // Seed an active report with severity 'buggy_wheels' and note 'Original owner note'
    await assertSucceeds(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        ...validReportPayload('rep-corrob-1', 'owner-uid-1'),
        severity: 'buggy_wheels',
        note: 'Original owner note',
      })
    );

    // ALLOW: stranger corroborates (+1 confirmations, serverTimestamp lastConfirmedAt, 1 new submitter, escalated severity)
    await assertSucceeds(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['GS-ANON-3333-4444'],
        severity: 'stepped_in',
      })
    );

    // ALLOW: second stranger corroborates (growing additionalSubmitters from 1 -> 2, keeping severity same)
    await assertSucceeds(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['GS-ANON-3333-4444', 'GS-ANON-4444-5555'],
      })
    );

    // DENY: stranger tries to edit note during corroboration (or standalone)
    await assertFails(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['GS-ANON-3333-4444', 'GS-ANON-4444-5555', 'GS-ANON-5555-6666'],
        note: 'Defaced by stranger',
      })
    );

    // DENY: severity de-escalation ('stepped_in' -> 'just_poop')
    await assertFails(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['GS-ANON-3333-4444', 'GS-ANON-4444-5555', 'GS-ANON-5555-6666'],
        severity: 'just_poop',
      })
    );

    // DENY: additionalSubmitters grows by 2 in one update
    await assertFails(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: [
          'GS-ANON-3333-4444',
          'GS-ANON-4444-5555',
          'GS-ANON-5555-6666',
          'GS-ANON-7777-8888',
        ],
      })
    );

    // DENY: additionalSubmitters padded with oversized string (>64 chars), duplicate submitter, or altered history
    await assertFails(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['GS-ANON-3333-4444', 'GS-ANON-4444-5555', 'X'.repeat(65)],
      })
    );
    await assertFails(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['GS-ANON-3333-4444', 'GS-ANON-4444-5555', 'GS-ANON-3333-4444'],
      })
    );
    await assertFails(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['TAMPERED-FIRST-TOKEN', 'GS-ANON-4444-5555', 'GS-ANON-8888-9999'],
      })
    );

    // DENY: confirmations incremented by 2 instead of 1
    await assertFails(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(2),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['GS-ANON-3333-4444', 'GS-ANON-4444-5555', 'GS-ANON-9999-0000'],
      })
    );
  });

  it('Fix 2 (Owner Edit/Undo): allows owner edit and undo inside 60m window and denies outside window or for non-owners', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-uid-1').firestore();
    const strangerDb = testEnv.authenticatedContext('stranger-uid-2').firestore();

    // Create fresh report as owner-uid-1
    await assertSucceeds(
      setDoc(
        doc(ownerDb, 'clean_greystones_reports', 'rep-owner-fresh'),
        validReportPayload('rep-owner-fresh', 'owner-uid-1')
      )
    );

    // ALLOW: owner edits note and adds valid JPEG photo inside the 60m window
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-owner-fresh'), {
        note: 'Added note within window',
        hasPhoto: true,
        photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/',
      })
    );

    // DENY: owner tries to attach non-JPEG photoDataUrl during owner edit
    await assertFails(
      updateDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-owner-fresh'), {
        hasPhoto: true,
        photoDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
      })
    );

    // DENY: non-owner (stranger) tries to edit note or undo inside the 60m window
    await assertFails(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-owner-fresh'), {
        note: 'Stranger hijack attempt',
      })
    );
    await assertFails(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-owner-fresh'), {
        status: 'deleted',
        deletedAt: serverTimestamp(),
      })
    );

    // ALLOW: owner undoes (soft-deletes) their own report inside the 60m window
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-owner-fresh'), {
        status: 'deleted',
        deletedAt: serverTimestamp(),
      })
    );

    // Seed an expired report (createdAt 65 minutes ago) owned by owner-uid-1
    const sixtyFiveMinutesAgo = Timestamp.fromMillis(Date.now() - 65 * 60 * 1000);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminBypassDb = context.firestore();
      await setDoc(doc(adminBypassDb, 'clean_greystones_reports', 'rep-owner-expired'), {
        ...validReportPayload('rep-owner-expired', 'owner-uid-1'),
        createdAt: sixtyFiveMinutesAgo,
      });
    });

    // DENY: owner attempts undo outside the 60-minute window
    await assertFails(
      updateDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-owner-expired'), {
        status: 'deleted',
        deletedAt: serverTimestamp(),
      })
    );

    // DENY: owner attempts note edit outside the 60-minute window
    await assertFails(
      updateDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-owner-expired'), {
        note: 'Late edit after 65 minutes',
      })
    );
  });
});
