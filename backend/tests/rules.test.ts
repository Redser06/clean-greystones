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
  batch.set(db.doc(`modes/${mode}/towns/${townId}/apps/${appId}/rateLimits/${uid}`), {
    ...rate,
    lastReportId: reportId,
  });
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

  it('limits photo uploads by size, type, file name, and app/town/mode metadata', async () => {
    const uid = 'resident-photo';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('modes/prod/towns/greystones/apps/litter/reports/rep-photo').set({ authorUid: uid });
      await context.firestore().doc('modes/prod/towns/greystones/apps/litter/reports/rep-gif').set({ authorUid: uid });
      await context.firestore().doc('modes/prod/towns/greystones/apps/litter/reports/rep-big').set({ authorUid: uid });
    });
    const owner = testEnv.authenticatedContext(uid).storage();
    const path = 'modes/prod/towns/greystones/apps/litter/reports/rep-photo/photo';
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const meta = { ownerUid: uid, mode: 'prod', townId: 'greystones', appId: 'litter' };
    const put = (target: firebase.storage.Reference, data: Uint8Array, metadata: firebase.storage.UploadMetadata) =>
      Promise.resolve(target.put(data, metadata));
    await assertSucceeds(put(owner.ref(path), bytes, { contentType: 'image/jpeg', customMetadata: meta }));
    await assertFails(put(owner.ref(path), bytes, { contentType: 'image/jpeg', customMetadata: meta }));
    await assertSucceeds(owner.ref(path).getMetadata());
    await assertFails(testEnv.unauthenticatedContext().storage().ref(path).getMetadata());
    await assertFails(testEnv.authenticatedContext('other').storage().ref(path).getMetadata());
    await assertSucceeds(testEnv.authenticatedContext('admin-gs', { admin: { towns: ['greystones'] } }).storage().ref(path).getMetadata());
    await assertFails(put(owner.ref('modes/prod/towns/greystones/apps/litter/reports/rep-photo/photo.jpg'), bytes, {
      contentType: 'image/jpeg',
      customMetadata: meta,
    }));
    await assertFails(put(owner.ref('modes/prod/towns/greystones/apps/litter/reports/rep-gif/photo'), bytes, {
      contentType: 'image/gif',
      customMetadata: meta,
    }));
    await assertFails(put(owner.ref('modes/prod/towns/greystones/apps/litter/reports/rep-photo/photo'), bytes, {
      contentType: 'image/jpeg',
      customMetadata: { ownerUid: uid, mode: 'demo', townId: 'bray', appId: 'roads' },
    }));
    await assertFails(put(owner.ref('modes/demo/towns/greystones/apps/litter/reports/rep-photo/photo'), bytes, {
      contentType: 'image/jpeg',
      customMetadata: { ownerUid: uid, mode: 'demo', townId: 'greystones', appId: 'litter' },
    }));
    const oversized = new Uint8Array(5 * 1024 * 1024);
    await assertFails(put(owner.ref('modes/prod/towns/greystones/apps/litter/reports/rep-big/photo'), oversized, {
      contentType: 'image/jpeg',
      customMetadata: meta,
    }));
  });

  it('rejects a demo write', async () => {
    const uid = 'resident-demo';
    const db = testEnv.authenticatedContext(uid).firestore();
    await assertFails(createReport(
      db,
      uid,
      'demo',
      'greystones',
      'litter',
      'rep-demo-write',
      reportBody(uid, { mode: 'demo' }),
      { uid, count: 1, windowStart: stamp() },
    ));
    await assertFails(db.doc(`modes/demo/towns/greystones/apps/litter/rateLimits/${uid}`).set({
      uid,
      count: 1,
      windowStart: stamp(),
    }));
  });

  it('rejects an unknown town', async () => {
    const uid = 'resident-bray';
    const db = testEnv.authenticatedContext(uid).firestore();
    await assertFails(createReport(
      db,
      uid,
      'prod',
      'bray',
      'litter',
      'rep-bray',
      reportBody(uid, { townId: 'bray' }),
      { uid, count: 1, windowStart: stamp() },
    ));
  });

  it('rejects resetting the rate window to sneak 30 reports into one hour', async () => {
    const uid = 'resident-bypass';
    const db = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(createReport(
      db,
      uid,
      'prod',
      'greystones',
      'litter',
      'rep-bypass-1',
      reportBody(uid),
      { uid, count: 1, windowStart: stamp() },
    ));
    for (let n = 2; n <= 30; n += 1) {
      await assertFails(createReport(
        db,
        uid,
        'prod',
        'greystones',
        'litter',
        `rep-bypass-${n}`,
        reportBody(uid),
        { uid, count: 1, windowStart: stamp() },
      ));
    }
    const saved = await db.doc(`modes/prod/towns/greystones/apps/litter/rateLimits/${uid}`).get();
    assert.equal(saved.data()?.count, 1);
  });

  it('rejects an orphan upload and a foreign upload', async () => {
    const ownerUid = 'resident-owner';
    const strangerUid = 'resident-stranger';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('modes/prod/towns/greystones/apps/litter/reports/rep-owned').set({
        authorUid: ownerUid,
      });
    });
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const put = (target: firebase.storage.Reference, metadata: firebase.storage.UploadMetadata) =>
      Promise.resolve(target.put(bytes, metadata));
    const owner = testEnv.authenticatedContext(ownerUid).storage();
    const stranger = testEnv.authenticatedContext(strangerUid).storage();
    const ownerMeta = { ownerUid, mode: 'prod', townId: 'greystones', appId: 'litter' };
    await assertFails(put(owner.ref('modes/prod/towns/greystones/apps/litter/reports/rep-missing/photo'), {
      contentType: 'image/jpeg',
      customMetadata: ownerMeta,
    }));
    await assertFails(put(stranger.ref('modes/prod/towns/greystones/apps/litter/reports/rep-owned/photo'), {
      contentType: 'image/jpeg',
      customMetadata: { ownerUid: strangerUid, mode: 'prod', townId: 'greystones', appId: 'litter' },
    }));
    await assertSucceeds(put(owner.ref('modes/prod/towns/greystones/apps/litter/reports/rep-owned/photo'), {
      contentType: 'image/jpeg',
      customMetadata: ownerMeta,
    }));
    await assertFails(put(owner.ref('modes/prod/towns/greystones/apps/litter/reports/rep-owned/photo'), {
      contentType: 'image/jpeg',
      customMetadata: ownerMeta,
    }));
  });

  it('rejects a batch that creates more than one report on a single rate step', async () => {
    const uid = 'resident-multi';
    const db = testEnv.authenticatedContext(uid).firestore();
    const opening = db.batch();
    for (let n = 1; n <= 10; n += 1) {
      opening.set(
        db.doc(`modes/prod/towns/greystones/apps/litter/reports/rep-open-${n}`),
        reportBody(uid),
      );
    }
    opening.set(db.doc(`modes/prod/towns/greystones/apps/litter/rateLimits/${uid}`), {
      uid,
      count: 1,
      windowStart: stamp(),
      lastReportId: 'rep-open-1',
    });
    await assertFails(opening.commit());

    await assertSucceeds(createReport(
      db,
      uid,
      'prod',
      'greystones',
      'litter',
      'rep-first',
      reportBody(uid),
      { uid, count: 1, windowStart: stamp() },
    ));
    const windowStart = (await db.doc(`modes/prod/towns/greystones/apps/litter/rateLimits/${uid}`).get()).data()?.windowStart;
    const batch = db.batch();
    for (let n = 1; n <= 10; n += 1) {
      batch.set(
        db.doc(`modes/prod/towns/greystones/apps/litter/reports/rep-multi-${n}`),
        reportBody(uid),
      );
    }
    batch.set(db.doc(`modes/prod/towns/greystones/apps/litter/rateLimits/${uid}`), {
      uid,
      count: 2,
      windowStart,
      lastReportId: 'rep-multi-1',
    });
    await assertFails(batch.commit());
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const rate = await context.firestore().doc(`modes/prod/towns/greystones/apps/litter/rateLimits/${uid}`).get();
      assert.equal(rate.data()?.count, 1);
      assert.equal(rate.data()?.lastReportId, 'rep-first');
      const saved = await context.firestore().doc('modes/prod/towns/greystones/apps/litter/reports/rep-multi-1').get();
      assert.equal(saved.exists, false);
    });
  });

  it('holds the hourly cap at 8 when each batch adds one report', async () => {
    const uid = 'resident-steps';
    const db = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(createReport(
      db,
      uid,
      'prod',
      'greystones',
      'litter',
      'rep-step-1',
      reportBody(uid),
      { uid, count: 1, windowStart: stamp() },
    ));
    const windowStart = (await db.doc(`modes/prod/towns/greystones/apps/litter/rateLimits/${uid}`).get()).data()?.windowStart;
    assert.ok(windowStart);
    for (let count = 2; count <= 8; count += 1) {
      await assertSucceeds(createReport(
        db,
        uid,
        'prod',
        'greystones',
        'litter',
        `rep-step-${count}`,
        reportBody(uid),
        { uid, count, windowStart },
      ));
    }
    const ninth = db.batch();
    ninth.set(db.doc('modes/prod/towns/greystones/apps/litter/reports/rep-step-9'), reportBody(uid));
    ninth.set(db.doc('modes/prod/towns/greystones/apps/litter/reports/rep-step-extra'), reportBody(uid));
    ninth.set(db.doc(`modes/prod/towns/greystones/apps/litter/rateLimits/${uid}`), {
      uid,
      count: 9,
      windowStart,
      lastReportId: 'rep-step-9',
    });
    await assertFails(ninth.commit());
    await assertFails(createReport(
      db,
      uid,
      'prod',
      'greystones',
      'litter',
      'rep-step-9',
      reportBody(uid),
      { uid, count: 9, windowStart },
    ));
    const rate = await db.doc(`modes/prod/towns/greystones/apps/litter/rateLimits/${uid}`).get();
    assert.equal(rate.data()?.count, 8);
    assert.equal(rate.data()?.lastReportId, 'rep-step-8');
  });
});
