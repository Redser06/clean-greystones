import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
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
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  increment,
  arrayUnion,
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
    const secondStrangerDb = testEnv.authenticatedContext('stranger-uid-3').firestore();
    const thirdStrangerDb = testEnv.authenticatedContext('stranger-uid-4').firestore();

    // Seed an active report with severity 'buggy_wheels' and note 'Original owner note'
    await assertSucceeds(
      setDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        ...validReportPayload('rep-corrob-1', 'owner-uid-1'),
        severity: 'buggy_wheels',
        note: 'Original owner note',
      })
    );

    // ALLOW: stranger corroborates (+1 confirmations, serverTimestamp lastConfirmedAt, own uid appended, escalated severity)
    await assertSucceeds(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['stranger-uid-2'],
        severity: 'stepped_in',
      })
    );

    // ALLOW: second stranger corroborates (growing additionalSubmitters from 1 -> 2 with their own uid, keeping severity same)
    await assertSucceeds(
      updateDoc(doc(secondStrangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['stranger-uid-2', 'stranger-uid-3'],
      })
    );

    // DENY: third stranger tries to edit note during otherwise valid corroboration
    await assertFails(
      updateDoc(doc(thirdStrangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['stranger-uid-2', 'stranger-uid-3', 'stranger-uid-4'],
        note: 'Defaced by stranger',
      })
    );

    // DENY: severity de-escalation ('stepped_in' -> 'just_poop') even with valid new uid
    await assertFails(
      updateDoc(doc(thirdStrangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['stranger-uid-2', 'stranger-uid-3', 'stranger-uid-4'],
        severity: 'just_poop',
      })
    );

    // DENY: additionalSubmitters grows by 2 in one update
    await assertFails(
      updateDoc(doc(thirdStrangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: [
          'stranger-uid-2',
          'stranger-uid-3',
          'stranger-uid-4',
          'stranger-uid-5',
        ],
      })
    );

    // DENY: additionalSubmitters padded with client-supplied fake token instead of request.auth.uid, duplicate uid, or altered history
    await assertFails(
      updateDoc(doc(thirdStrangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['stranger-uid-2', 'stranger-uid-3', 'GS-ANON-FAKE-TOKEN'],
      })
    );
    await assertFails(
      updateDoc(doc(strangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['stranger-uid-2', 'stranger-uid-3', 'stranger-uid-2'],
      })
    );
    await assertFails(
      updateDoc(doc(thirdStrangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['TAMPERED-FIRST-UID', 'stranger-uid-3', 'stranger-uid-4'],
      })
    );

    // DENY: confirmations incremented by 2 instead of 1 even with valid new uid
    await assertFails(
      updateDoc(doc(thirdStrangerDb, 'clean_greystones_reports', 'rep-corrob-1'), {
        confirmations: increment(2),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['stranger-uid-2', 'stranger-uid-3', 'stranger-uid-4'],
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

  it('B3 (Repeat +1): denies repeat +1 corroboration from the same auth uid (one confirmation per auth uid)', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-uid-1').firestore();
    const voterDb = testEnv.authenticatedContext('voter-uid-2').firestore();

    await assertSucceeds(
      setDoc(
        doc(ownerDb, 'clean_greystones_reports', 'rep-repeat-1'),
        validReportPayload('rep-repeat-1', 'owner-uid-1')
      )
    );

    // ALLOW: first +1 from voter-uid-2 appending request.auth.uid
    await assertSucceeds(
      updateDoc(doc(voterDb, 'clean_greystones_reports', 'rep-repeat-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: arrayUnion('voter-uid-2'),
      })
    );

    // DENY: repeat +1 from the same auth uid via arrayUnion (additionalSubmitters does not change)
    await assertFails(
      updateDoc(doc(voterDb, 'clean_greystones_reports', 'rep-repeat-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: arrayUnion('voter-uid-2'),
      })
    );

    // DENY: repeat +1 from the same auth uid attempting to duplicate their uid in additionalSubmitters
    await assertFails(
      updateDoc(doc(voterDb, 'clean_greystones_reports', 'rep-repeat-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['voter-uid-2', 'voter-uid-2'],
      })
    );

    // DENY: repeat +1 attempting to push a rotated/fake submitterToken under the same auth uid
    await assertFails(
      updateDoc(doc(voterDb, 'clean_greystones_reports', 'rep-repeat-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['voter-uid-2', 'GS-ANON-3333-4444'],
      })
    );
  });

  it('B5 (Unauthenticated corroboration): denies unauthenticated corroboration and allows authenticated corroboration', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-uid-1').firestore();
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const authedVoterDb = testEnv.authenticatedContext('voter-uid-2').firestore();

    await assertSucceeds(
      setDoc(
        doc(ownerDb, 'clean_greystones_reports', 'rep-unauth-corrob'),
        validReportPayload('rep-unauth-corrob', 'owner-uid-1')
      )
    );

    // DENY: unauthenticated client cannot corroborate or fill additionalSubmitters
    await assertFails(
      updateDoc(doc(unauthDb, 'clean_greystones_reports', 'rep-unauth-corrob'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: arrayUnion('voter-uid-2'),
      })
    );

    // ALLOW: authenticated client can corroborate with their own uid
    await assertSucceeds(
      updateDoc(doc(authedVoterDb, 'clean_greystones_reports', 'rep-unauth-corrob'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: arrayUnion('voter-uid-2'),
      })
    );
  });

  it('B2 (Legacy-shaped doc): string createdAt, legacyCreatedAtString present, no ownerUid — denies owner edit/undo while allowing read and corroboration', async () => {
    const callerDb = testEnv.authenticatedContext('caller-uid-1').firestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const rawDb = context.firestore();
      const { ownerUid: _omitOwner, ...rest } = validReportPayload('rep-legacy-1', 'unused');
      await setDoc(doc(rawDb, 'clean_greystones_reports', 'rep-legacy-1'), {
        ...rest,
        createdAt: '2026-10-22T14:20:00.000Z',
        legacyCreatedAtString: '2026-10-22T14:20:00.000Z',
      });
    });

    // ALLOW: reading the legacy-shaped doc
    const snap = await assertSucceeds(
      getDoc(doc(callerDb, 'clean_greystones_reports', 'rep-legacy-1'))
    );
    assert.equal(snap.exists(), true);

    // ALLOW: authenticated corroboration (+1) on the legacy-shaped doc with caller's uid
    await assertSucceeds(
      updateDoc(doc(callerDb, 'clean_greystones_reports', 'rep-legacy-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: arrayUnion('caller-uid-1'),
      })
    );

    // DENY: owner edit or undo on a legacy doc with no ownerUid
    await assertFails(
      updateDoc(doc(callerDb, 'clean_greystones_reports', 'rep-legacy-1'), {
        note: 'Cannot edit legacy doc without ownerUid',
      })
    );
    await assertFails(
      updateDoc(doc(callerDb, 'clean_greystones_reports', 'rep-legacy-1'), {
        status: 'deleted',
        deletedAt: serverTimestamp(),
      })
    );
  });

  it('B4 (Owner confirming own report): denies owner confirming own report with ownerUid, submitterToken, or omitted additionalSubmitters', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-uid-1').firestore();

    await assertSucceeds(
      setDoc(
        doc(ownerDb, 'clean_greystones_reports', 'rep-self-confirm'),
        validReportPayload('rep-self-confirm', 'owner-uid-1')
      )
    );

    // DENY: owner attempting to append their own submitterToken ('GS-ANON-1111-2222') to additionalSubmitters
    await assertFails(
      updateDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-self-confirm'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: arrayUnion('GS-ANON-1111-2222'),
      })
    );

    // DENY: owner attempting to append their own ownerUid ('owner-uid-1') to additionalSubmitters
    await assertFails(
      updateDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-self-confirm'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: arrayUnion('owner-uid-1'),
      })
    );

    // DENY: owner or any caller attempting to increment confirmations without changing additionalSubmitters
    await assertFails(
      updateDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-self-confirm'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        severity: 'stepped_in',
      })
    );
  });

  it('B1 (Migrated doc): Timestamp createdAt plus legacyCreatedAtString allows read, corroboration, and owner edit while denying legacyCreatedAtString tampering', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-uid-1').firestore();
    const voterDb = testEnv.authenticatedContext('voter-uid-2').firestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const rawDb = context.firestore();
      await setDoc(doc(rawDb, 'clean_greystones_reports', 'rep-migrated-1'), {
        ...validReportPayload('rep-migrated-1', 'owner-uid-1'),
        createdAt: Timestamp.now(),
        legacyCreatedAtString: '2026-10-22T15:00:00.000Z',
      });
    });

    // ALLOW: reading and corroborating migrated doc
    await assertSucceeds(
      getDoc(doc(voterDb, 'clean_greystones_reports', 'rep-migrated-1'))
    );
    await assertSucceeds(
      updateDoc(doc(voterDb, 'clean_greystones_reports', 'rep-migrated-1'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: arrayUnion('voter-uid-2'),
      })
    );

    // ALLOW: owner editing note on a fresh migrated doc while preserving legacyCreatedAtString
    await assertSucceeds(
      updateDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-migrated-1'), {
        note: 'Owner note on migrated report',
      })
    );

    // DENY: owner or voter attempting to overwrite or delete legacyCreatedAtString
    await assertFails(
      updateDoc(doc(ownerDb, 'clean_greystones_reports', 'rep-migrated-1'), {
        note: 'Tamper attempt',
        legacyCreatedAtString: '1999-01-01T00:00:00.000Z',
      })
    );
  });

  it('B1 (Mixed collection ordering probe): proves string createdAt outranks Timestamp createdAt before migration and Timestamp ordering is restored after migration', async () => {
    const readerDb = testEnv.authenticatedContext('reader-uid-1').firestore();

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const rawDb = context.firestore();
      // Legacy doc from 22 Oct 2026 stored with string createdAt
      const { ownerUid: _omit, ...legacyBase } = validReportPayload('rep-order-legacy', 'unused');
      await setDoc(doc(rawDb, 'clean_greystones_reports', 'rep-order-legacy'), {
        ...legacyBase,
        createdAt: '2026-10-22T09:00:00.000Z',
      });

      // Newer doc from 29 Oct 2026 stored with Timestamp createdAt
      await setDoc(doc(rawDb, 'clean_greystones_reports', 'rep-order-timestamp'), {
        ...validReportPayload('rep-order-timestamp', 'owner-uid-1'),
        createdAt: Timestamp.fromDate(new Date('2026-10-29T09:00:00.000Z')),
      });
    });

    // ALLOW: query mixed collection with orderBy('createdAt', 'desc')
    // In Firestore's value type ordering, string > timestamp, so un-migrated string doc sorts first in desc order
    const preMigrationSnap = await assertSucceeds(
      getDocs(query(collection(readerDb, 'clean_greystones_reports'), orderBy('createdAt', 'desc')))
    );
    assert.deepEqual(
      preMigrationSnap.docs.map((d) => d.id),
      ['rep-order-legacy', 'rep-order-timestamp']
    );

    // DENY: non-admin client cannot convert or overwrite createdAt directly
    await assertFails(
      updateDoc(doc(readerDb, 'clean_greystones_reports', 'rep-order-legacy'), {
        createdAt: Timestamp.fromDate(new Date('2026-10-22T09:00:00.000Z')),
        legacyCreatedAtString: '2026-10-22T09:00:00.000Z',
      })
    );

    // Apply the B1 admin migration (convert string createdAt -> Timestamp + legacyCreatedAtString)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const rawDb = context.firestore();
      await updateDoc(doc(rawDb, 'clean_greystones_reports', 'rep-order-legacy'), {
        createdAt: Timestamp.fromDate(new Date('2026-10-22T09:00:00.000Z')),
        legacyCreatedAtString: '2026-10-22T09:00:00.000Z',
      });
    });

    // ALLOW: after migration, orderBy('createdAt', 'desc') returns the newer 29 Oct doc before the 22 Oct doc
    const postMigrationSnap = await assertSucceeds(
      getDocs(query(collection(readerDb, 'clean_greystones_reports'), orderBy('createdAt', 'desc')))
    );
    assert.deepEqual(
      postMigrationSnap.docs.map((d) => d.id),
      ['rep-order-timestamp', 'rep-order-legacy']
    );
  });

  it('denies confirmation count inflation without a new request.auth.uid in additionalSubmitters', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-uid-1').firestore();
    const voterDb = testEnv.authenticatedContext('voter-uid-2').firestore();

    await assertSucceeds(
      setDoc(
        doc(ownerDb, 'clean_greystones_reports', 'rep-no-inflate'),
        validReportPayload('rep-no-inflate', 'owner-uid-1')
      )
    );

    // DENY: incrementing confirmations while omitting additionalSubmitters completely
    await assertFails(
      updateDoc(doc(voterDb, 'clean_greystones_reports', 'rep-no-inflate'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
      })
    );

    // DENY: incrementing confirmations while keeping additionalSubmitters unchanged ([])
    await assertFails(
      updateDoc(doc(voterDb, 'clean_greystones_reports', 'rep-no-inflate'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: [],
      })
    );

    // DENY: incrementing confirmations while supplying a fake token instead of request.auth.uid
    await assertFails(
      updateDoc(doc(voterDb, 'clean_greystones_reports', 'rep-no-inflate'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: ['GS-ANON-FAKE-0001'],
      })
    );
  });

  it('enforces the 100-submitter cap on additionalSubmitters and rejects fake-token stuffing', async () => {
    const first99 = Array.from({ length: 99 }, (_, i) => `voter-uid-${i + 1}`);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const rawDb = context.firestore();
      await setDoc(doc(rawDb, 'clean_greystones_reports', 'rep-cap-100'), {
        ...validReportPayload('rep-cap-100', 'owner-uid-0'),
        createdAt: Timestamp.now(),
        confirmations: 100,
        additionalSubmitters: first99,
      });
    });

    const voter100Db = testEnv.authenticatedContext('voter-uid-100').firestore();
    const voter101Db = testEnv.authenticatedContext('voter-uid-101').firestore();

    // ALLOW: 100th submitter (voter-uid-100) brings additionalSubmitters to exactly 100
    await assertSucceeds(
      updateDoc(doc(voter100Db, 'clean_greystones_reports', 'rep-cap-100'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: [...first99, 'voter-uid-100'],
      })
    );

    // DENY: 101st submitter (voter-uid-101) exceeds the 100-submitter cap (size 101 > 100)
    await assertFails(
      updateDoc(doc(voter101Db, 'clean_greystones_reports', 'rep-cap-100'), {
        confirmations: increment(1),
        lastConfirmedAt: serverTimestamp(),
        additionalSubmitters: [...first99, 'voter-uid-100', 'voter-uid-101'],
      })
    );
  });

  it('enforces event createdAt == request.time on clean_greystones_events creates', async () => {
    const userDb = testEnv.authenticatedContext('user-uid-1').firestore();

    // DENY: event create with future Timestamp createdAt
    await assertFails(
      setDoc(doc(userDb, 'clean_greystones_events', 'evt-future'), {
        ...validEventPayload('evt-future', 'user-uid-1'),
        createdAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      })
    );

    // DENY: event create with past Timestamp createdAt
    await assertFails(
      setDoc(doc(userDb, 'clean_greystones_events', 'evt-past'), {
        ...validEventPayload('evt-past', 'user-uid-1'),
        createdAt: Timestamp.fromMillis(Date.now() - 60 * 60 * 1000),
      })
    );

    // DENY: event create with string createdAt instead of serverTimestamp
    await assertFails(
      setDoc(doc(userDb, 'clean_greystones_events', 'evt-string'), {
        ...validEventPayload('evt-string', 'user-uid-1'),
        createdAt: '2026-10-26T12:00:00.000Z',
      })
    );

    // ALLOW: event create with createdAt == request.time (serverTimestamp)
    await assertSucceeds(
      setDoc(
        doc(userDb, 'clean_greystones_events', 'evt-now'),
        validEventPayload('evt-now', 'user-uid-1')
      )
    );
  });

  it('restricts clean_greystones_events read access strictly to admins (never public)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const rawDb = context.firestore();
      await setDoc(doc(rawDb, 'clean_greystones_events', 'evt-secret-1'), {
        ...validEventPayload('evt-secret-1', 'owner-uid-1'),
        createdAt: Timestamp.now(),
      });
    });

    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const ownerNonAdminDb = testEnv.authenticatedContext('owner-uid-1').firestore();
    const strangerDb = testEnv.authenticatedContext('stranger-uid-2').firestore();
    const adminDb = testEnv.authenticatedContext('admin-uid-1', { admin: true }).firestore();

    // DENY: unauthenticated getDoc / getDocs on clean_greystones_events
    await assertFails(getDoc(doc(unauthDb, 'clean_greystones_events', 'evt-secret-1')));
    await assertFails(getDocs(collection(unauthDb, 'clean_greystones_events')));

    // DENY: signed-in non-admin (including event ownerUid) getDoc / getDocs on clean_greystones_events
    await assertFails(getDoc(doc(ownerNonAdminDb, 'clean_greystones_events', 'evt-secret-1')));
    await assertFails(getDocs(collection(ownerNonAdminDb, 'clean_greystones_events')));
    await assertFails(getDoc(doc(strangerDb, 'clean_greystones_events', 'evt-secret-1')));

    // ALLOW: verified admin getDoc / getDocs on clean_greystones_events
    await assertSucceeds(getDoc(doc(adminDb, 'clean_greystones_events', 'evt-secret-1')));
    await assertSucceeds(getDocs(collection(adminDb, 'clean_greystones_events')));
  });

  it('denies signed-in non-admins and unauthenticated users from writing admin_roles', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const rawDb = context.firestore();
      await setDoc(doc(rawDb, 'admin_roles', 'existing-admin'), { role: 'admin' });
    });

    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const nonAdminDb = testEnv.authenticatedContext('user-uid-1').firestore();
    const adminDb = testEnv.authenticatedContext('admin-uid-1', { admin: true }).firestore();

    // DENY: unauthenticated user writing admin_roles
    await assertFails(setDoc(doc(unauthDb, 'admin_roles', 'anon-uid'), { role: 'admin' }));

    // DENY: signed-in non-admin attempting self-promotion or granting another user admin role
    await assertFails(setDoc(doc(nonAdminDb, 'admin_roles', 'user-uid-1'), { role: 'admin' }));
    await assertFails(setDoc(doc(nonAdminDb, 'admin_roles', 'other-uid'), { role: 'admin' }));

    // DENY: signed-in non-admin updating or deleting an existing admin_roles doc
    await assertFails(updateDoc(doc(nonAdminDb, 'admin_roles', 'existing-admin'), { role: 'user' }));
    await assertFails(deleteDoc(doc(nonAdminDb, 'admin_roles', 'existing-admin')));

    // ALLOW: verified admin writing admin_roles
    await assertSucceeds(setDoc(doc(adminDb, 'admin_roles', 'new-admin-uid'), { role: 'admin' }));
  });
});
