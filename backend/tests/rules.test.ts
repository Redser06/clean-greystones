import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';

const projectId = 'demo-clean-greystones';
let testEnv: RulesTestEnvironment;

function stamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

function reportBody(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    mode: 'prod',
    townId: 'greystones',
    appId: 'litter',
    is_seeded_demo: false,
    authorUid: uid,
    lat: 53.144,
    lng: -6.06,
    severity: 'just_poop',
    createdAt: stamp(),
    status: 'spotted',
    submitterToken: 'GS-ANON-TEST-TEST',
    ...overrides,
  };
}

async function createReport(
  db: firebase.firestore.Firestore,
  uid: string,
  mode: string,
  townId: string,
  appId: string,
  reportId: string,
  body: Record<string, unknown>,
  rate: Record<string, unknown>,
) {
  const batch = db.batch();
  batch.set(db.doc(`modes/${mode}/towns/${townId}/apps/${appId}/reports/${reportId}`), body);
  batch.set(db.doc(`modes/${mode}/towns/${townId}/apps/${appId}/rateLimits/${uid}`), rate);
  await batch.commit();
}

describe('firestore and storage rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
      storage: {
        rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'),
        host: '127.0.0.1',
        port: 9199,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('lets a signed-in resident create and read their own report, and rejects scope mismatches', async () => {
    const uid = 'resident-1';
    const db = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(createReport(
      db,
      uid,
      'prod',
      'greystones',
      'litter',
      'rep-own',
      reportBody(uid),
      { uid, count: 1, windowStart: stamp() },
    ));
    await assertSucceeds(db.doc('modes/prod/towns/greystones/apps/litter/reports/rep-own').get());

    await assertFails(createReport(
      db,
      uid,
      'prod',
      'greystones',
      'litter',
      'rep-wrong-app',
      reportBody(uid, { appId: 'roads' }),
      { uid, count: 1, windowStart: stamp() },
    ));
    await assertFails(createReport(
      db,
      uid,
      'prod',
      'greystones',
      'litter',
      'rep-wrong-town',
      reportBody(uid, { townId: 'bray' }),
      { uid, count: 1, windowStart: stamp() },
    ));
    await assertFails(createReport(
      db,
      uid,
      'prod',
      'greystones',
      'litter',
      'rep-wrong-mode',
      reportBody(uid, { mode: 'demo' }),
      { uid, count: 1, windowStart: stamp() },
    ));
    await assertFails(createReport(
      db,
      uid,
      'demo',
      'greystones',
      'roads',
      'rep-cross',
      reportBody(uid, { mode: 'prod', appId: 'litter', townId: 'greystones' }),
      { uid, count: 1, windowStart: stamp() },
    ));
    await assertFails(createReport(
      db,
      uid,
      'prod',
      'greystones',
      'litter',
      'rep-seed',
      reportBody(uid, { is_seeded_demo: true }),
      { uid, count: 1, windowStart: stamp() },
    ));

    const stranger = testEnv.authenticatedContext('resident-2').firestore();
    await assertFails(stranger.doc('modes/prod/towns/greystones/apps/litter/reports/rep-own').get());
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc('modes/prod/towns/greystones/apps/litter/reports/rep-own').get());
  });

  it('lets only that town admin read aggregates, and enforces the hourly cap', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('modes/prod/towns/greystones/apps/litter/aggregates/summary').set({ total: 3 });
      await db.doc('modes/demo/towns/greystones/apps/roads/aggregates/summary').set({ total: 1 });
    });

    const greystonesAdmin = testEnv.authenticatedContext('admin-gs', {
      admin: { towns: ['greystones'] },
    }).firestore();
    const brayAdmin = testEnv.authenticatedContext('admin-bray', {
      admin: { towns: ['bray'] },
    }).firestore();
    const resident = testEnv.authenticatedContext('resident-1').firestore();

    await assertSucceeds(greystonesAdmin.doc('modes/prod/towns/greystones/apps/litter/aggregates/summary').get());
    await assertSucceeds(greystonesAdmin.doc('modes/demo/towns/greystones/apps/roads/aggregates/summary').get());
    await assertFails(brayAdmin.doc('modes/prod/towns/greystones/apps/litter/aggregates/summary').get());
    await assertFails(resident.doc('modes/prod/towns/greystones/apps/litter/aggregates/summary').get());
    await assertFails(greystonesAdmin.doc('modes/prod/towns/greystones/apps/litter/aggregates/summary').set({ total: 9 }));

    const uid = 'resident-rate';
    const db = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(createReport(
      db,
      uid,
      'prod',
      'greystones',
      'litter',
      'rep-rate-1',
      reportBody(uid),
      { uid, count: 1, windowStart: stamp() },
    ));
    const rateSnap = await db.doc(`modes/prod/towns/greystones/apps/litter/rateLimits/${uid}`).get();
    const windowStart = rateSnap.data()?.windowStart;
    assert.ok(windowStart);
    for (let count = 2; count <= 8; count += 1) {
      await assertSucceeds(createReport(
        db,
        uid,
        'prod',
        'greystones',
        'litter',
        `rep-rate-${count}`,
        reportBody(uid),
        { uid, count, windowStart },
      ));
    }
    await assertFails(createReport(
      db,
      uid,
      'prod',
      'greystones',
      'litter',
      'rep-rate-9',
      reportBody(uid),
      { uid, count: 9, windowStart },
    ));
  });

  it('limits photo uploads by size, type, and app/town/mode metadata', async () => {
    const uid = 'resident-photo';
    const owner = testEnv.authenticatedContext(uid).storage();
    const path = 'modes/prod/towns/greystones/apps/litter/reports/rep-photo/photo.jpg';
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const meta = { ownerUid: uid, mode: 'prod', townId: 'greystones', appId: 'litter' };
    const put = (target: firebase.storage.Reference, data: Uint8Array, metadata: firebase.storage.UploadMetadata) =>
      Promise.resolve(target.put(data, metadata));
    await assertSucceeds(put(owner.ref(path), bytes, { contentType: 'image/jpeg', customMetadata: meta }));
    await assertSucceeds(owner.ref(path).getMetadata());
    await assertFails(testEnv.unauthenticatedContext().storage().ref(path).getMetadata());
    await assertFails(testEnv.authenticatedContext('other').storage().ref(path).getMetadata());
    await assertSucceeds(testEnv.authenticatedContext('admin-gs', { admin: { towns: ['greystones'] } }).storage().ref(path).getMetadata());
    await assertFails(put(owner.ref('modes/prod/towns/greystones/apps/litter/reports/rep-gif/photo.gif'), bytes, {
      contentType: 'image/gif',
      customMetadata: meta,
    }));
    await assertFails(put(owner.ref('modes/prod/towns/greystones/apps/litter/reports/rep-mismatch/photo.jpg'), bytes, {
      contentType: 'image/jpeg',
      customMetadata: { ownerUid: uid, mode: 'demo', townId: 'bray', appId: 'roads' },
    }));
    const oversized = new Uint8Array(5 * 1024 * 1024);
    await assertFails(put(owner.ref('modes/prod/towns/greystones/apps/litter/reports/rep-big/photo.jpg'), oversized, {
      contentType: 'image/jpeg',
      customMetadata: meta,
    }));
  });
});
