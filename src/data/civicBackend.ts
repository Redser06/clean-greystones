import type { Timestamp } from 'firebase/firestore';
import { isDemo } from '../config/mode';
import { town } from '../config/town';
import { civicFirebase } from '../lib/firebaseClient';
import type { FoulingReport, SeverityType } from '../types';
import {
  nextRateWindow,
  photoStoragePath,
  rateLimitDocPath,
  reportCollectionPath,
  reportDocPath,
  type CivicAppId,
  type CivicMode,
} from './firestorePaths';

export interface StoredReport {
  mode: CivicMode;
  townId: string;
  appId: CivicAppId;
  is_seeded_demo: false;
  authorUid: string;
  lat: number;
  lng: number;
  severity: SeverityType;
  createdAt: Timestamp;
  status: FoulingReport['status'];
  submitterToken: string;
  note?: string;
}

export function dataMode(): CivicMode {
  return isDemo ? 'demo' : 'prod';
}

/** This repository is the litter app. The roads app is a separate client of the same backend. */
export function thisAppId(): CivicAppId {
  const app = town.apps.find((item) => item.key === 'clean');
  if (!app || app.id !== 'litter') {
    throw new Error('Town config must map the clean app to litter.');
  }
  return app.id;
}

function clipNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 500);
}

export async function submitResidentReport(
  report: FoulingReport,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (isDemo) return { ok: false, reason: 'demo-local' };
  if (report.isSeededDemo || report.is_seeded_demo) return { ok: false, reason: 'seeded' };
  const client = await civicFirebase();
  if (!client) return { ok: false, reason: 'unconfigured' };

  const [{ doc, getDoc, serverTimestamp, writeBatch }, { signInAnonymously }] = await Promise.all([
    import('firebase/firestore'),
    import('firebase/auth'),
  ]);
  const user = client.auth.currentUser ?? (await signInAnonymously(client.auth)).user;
  const mode = dataMode();
  const appId = thisAppId();
  const townId = town.townId;
  const reportId = report.id;
  const rateRef = doc(client.db, rateLimitDocPath(mode, townId, appId, user.uid));
  const existing = await getDoc(rateRef);
  const previous = existing.exists()
    ? {
        count: Number(existing.data().count ?? 0),
        windowStartMs: existing.data().windowStart?.toMillis?.() ?? 0,
      }
    : null;
  const next = nextRateWindow({ nowMs: Date.now(), previous });
  if ('limited' in next) return { ok: false, reason: 'rate-limited' };

  const payload: Omit<StoredReport, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> } = {
    mode,
    townId,
    appId,
    is_seeded_demo: false,
    authorUid: user.uid,
    lat: report.lat,
    lng: report.lng,
    severity: report.severity,
    createdAt: serverTimestamp(),
    status: report.status,
    submitterToken: report.submitterToken,
  };
  const note = clipNote(report.note);
  if (note) payload.note = note;

  const batch = writeBatch(client.db);
  batch.set(doc(client.db, reportDocPath(mode, townId, appId, reportId)), payload);
  batch.set(rateRef, {
    uid: user.uid,
    count: next.count,
    windowStart: next.count === 1 ? serverTimestamp() : existing.data()?.windowStart,
    lastReportId: reportId,
  });
  await batch.commit();
  return { ok: true, id: reportId };
}

export async function loadResidentReports(): Promise<FoulingReport[]> {
  if (isDemo) return [];
  const client = await civicFirebase();
  if (!client?.auth.currentUser) return [];
  const { collection, getDocs, query, where } = await import('firebase/firestore');
  const mode = dataMode();
  const appId = thisAppId();
  const snapshot = await getDocs(
    query(
      collection(client.db, reportCollectionPath(mode, town.townId, appId)),
      where('authorUid', '==', client.auth.currentUser.uid),
    ),
  );
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date(0).toISOString(),
      lat: data.lat,
      lng: data.lng,
      accuracyM: 0,
      streetName: '',
      areaName: '',
      h3Cell: '',
      severity: data.severity,
      status: data.status ?? 'spotted',
      confirmations: 1,
      note: data.note,
      submitterToken: data.submitterToken,
      nearestBinId: '',
      nearestBinCode: '',
      dBinAllM: 0,
      dBinVerifiedM: 0,
      isSeededDemo: false,
      is_seeded_demo: false,
    } satisfies FoulingReport;
  });
}

export async function uploadReportPhoto(
  reportId: string,
  file: Blob,
  contentType: string,
): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  if (isDemo) return { ok: false, reason: 'demo-local' };
  const client = await civicFirebase();
  if (!client?.auth.currentUser) return { ok: false, reason: 'signed-out' };
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    return { ok: false, reason: 'content-type' };
  }
  if (file.size >= 5 * 1024 * 1024) return { ok: false, reason: 'too-large' };
  const { ref, uploadBytes } = await import('firebase/storage');
  const mode = dataMode();
  const appId = thisAppId();
  const path = photoStoragePath(mode, town.townId, appId, reportId, 'photo');
  await uploadBytes(ref(client.storage, path), file, {
    contentType,
    customMetadata: {
      ownerUid: client.auth.currentUser.uid,
      mode,
      townId: town.townId,
      appId,
    },
  });
  return { ok: true, path };
}
