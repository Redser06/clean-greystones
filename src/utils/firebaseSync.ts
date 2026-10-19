import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  getDocs,
  Unsubscribe,
} from 'firebase/firestore';
import { CivicActionEvent, DailyFoulingSnapshot, FoulingReport } from '../types';

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'rapid-prototyping-4134c',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'rapid-prototyping-4134c.firebasestorage.app',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'rapid-prototyping-4134c.firebaseapp.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '285060831800',
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// Initialize Firebase App singleton only when configured
const app = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const db = app ? getFirestore(app) : null;

const REPORTS_COLLECTION = 'clean_greystones_reports';

/**
 * Real-time listener for crowdsourced communal reports across all residents and browsers.
 * Triggers callback immediately on initial load and whenever any device logs, updates, or deletes a report.
 */
export function subscribeToCrowdsourcedReports(
  onUpdate: (reports: FoulingReport[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) {
    if (onError) onError(new Error('Firebase is not configured'));
    return () => {};
  }

  const colRef = collection(db, REPORTS_COLLECTION);
  const q = query(colRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const live: FoulingReport[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as FoulingReport;
        live.push({
          ...data,
          id: docSnap.id,
        });
      });
      onUpdate(live);
    },
    (error) => {
      console.warn('Firestore subscription warning, falling back to local storage:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Saves or updates a fouling report in the communal cloud backend.
 */
export async function syncReportToCloud(report: FoulingReport): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, REPORTS_COLLECTION, report.id);
    await setDoc(docRef, report, { merge: true });
  } catch (err) {
    console.error('Failed to sync report to communal cloud:', err);
    throw err;
  }
}

/**
 * Deletes a fouling report from the communal cloud backend (accidental drop or moderation).
 */
export async function deleteReportFromCloud(reportId: string): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, REPORTS_COLLECTION, reportId);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Failed to delete report from communal cloud:', err);
    throw err;
  }
}

/**
 * Increments the confirmation (+1) count for a report in the communal cloud backend.
 */
export async function incrementConfirmationInCloud(
  reportId: string,
  newCount: number
): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, REPORTS_COLLECTION, reportId);
    await updateDoc(docRef, { confirmations: newCount });
  } catch (err) {
    console.error('Failed to increment confirmation in cloud:', err);
    throw err;
  }
}

/**
 * Batch deletes reports from the communal cloud backend (e.g. for complete clean slate reset).
 */
export async function clearReportsFromCloud(reportIds: string[]): Promise<void> {
  if (!db || reportIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    reportIds.forEach((id) => {
      batch.delete(doc(db, REPORTS_COLLECTION, id));
    });
    await batch.commit();
  } catch (err) {
    console.error('Failed to batch delete reports from cloud:', err);
    throw err;
  }
}

/**
 * Batch seeds demo reports to cloud for testing.
 */
export async function seedDemoReportsToCloud(reports: FoulingReport[]): Promise<void> {
  if (!db || reports.length === 0) return;
  try {
    const batch = writeBatch(db);
    reports.forEach((rep) => {
      batch.set(doc(db, REPORTS_COLLECTION, rep.id), rep, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.error('Failed to seed demo reports to cloud:', err);
    throw err;
  }
}

const SNAPSHOTS_COLLECTION = 'clean_greystones_snapshots';

/**
 * Saves a daily 24-hour summary snapshot in Cloud Firestore.
 */
export async function saveDailySnapshotToCloud(
  snapshot: DailyFoulingSnapshot
): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, SNAPSHOTS_COLLECTION, snapshot.date);
    await setDoc(docRef, snapshot, { merge: true });
  } catch (err) {
    console.error('Failed to save daily snapshot to cloud:', err);
  }
}

/**
 * Fetches historical daily snapshots from Cloud Firestore.
 */
export async function fetchSnapshotsFromCloud(): Promise<DailyFoulingSnapshot[]> {
  if (!db) return [];
  try {
    const colRef = collection(db, SNAPSHOTS_COLLECTION);
    const q = query(colRef, orderBy('date', 'desc'));
    const snap = await getDocs(q);
    const list: DailyFoulingSnapshot[] = [];
    snap.forEach((d) => {
      list.push(d.data() as DailyFoulingSnapshot);
    });
    return list;
  } catch (err) {
    console.warn('Could not fetch daily snapshots from cloud:', err);
    return [];
  }
}

/**
 * One-shot fetch of latest communal reports from Cloud Firestore
 * (used to ensure councillor emails contain the freshest backend evidence).
 */
export async function fetchLiveReportsFromCloud(): Promise<FoulingReport[]> {
  if (!db) return [];
  try {
    const colRef = collection(db, REPORTS_COLLECTION);
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const live: FoulingReport[] = [];
    snap.forEach((d) => {
      live.push({ ...(d.data() as FoulingReport), id: d.id });
    });
    return live;
  } catch (err) {
    console.warn('Failed to fetch live reports from cloud:', err);
    return [];
  }
}

/**
 * Atomically updates a primary report and marks a duplicate report as merged in Cloud Firestore.
 */
export async function mergeReportInCloud(
  primaryReport: FoulingReport,
  duplicateReportId?: string
): Promise<void> {
  if (!db) return;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, REPORTS_COLLECTION, primaryReport.id), primaryReport, { merge: true });
    if (duplicateReportId && duplicateReportId !== primaryReport.id) {
      batch.set(
        doc(db, REPORTS_COLLECTION, duplicateReportId),
        { status: 'merged', mergedIntoId: primaryReport.id },
        { merge: true }
      );
    }
    await batch.commit();
  } catch (err) {
    console.error('Failed to merge report in cloud:', err);
    throw err;
  }
}

const EVENTS_COLLECTION = 'clean_greystones_events';

/**
 * Logs an anonymous product analytics event (e.g. council email action, drop logged, corroboration).
 */
export async function logCivicEventToCloud(event: CivicActionEvent): Promise<void> {
  if (!db) return;
  try {
    const docRef = doc(db, EVENTS_COLLECTION, event.id);
    await setDoc(docRef, event, { merge: true });
  } catch (err) {
    console.error('Failed to log civic event to cloud:', err);
  }
}

/**
 * Real-time listener for civic product events (emails sent, button clicks, drops).
 */
export function subscribeToCivicEvents(
  onUpdate: (events: CivicActionEvent[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!db) {
    if (onError) onError(new Error('Firebase is not configured'));
    return () => {};
  }

  const colRef = collection(db, EVENTS_COLLECTION);
  const q = query(colRef, orderBy('timestamp', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: CivicActionEvent[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...(docSnap.data() as CivicActionEvent), id: docSnap.id });
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('Events subscription error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * One-shot fetch of all civic events from Cloud Firestore.
 */
export async function fetchCivicEventsFromCloud(): Promise<CivicActionEvent[]> {
  if (!db) return [];
  try {
    const colRef = collection(db, EVENTS_COLLECTION);
    const q = query(colRef, orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    const list: CivicActionEvent[] = [];
    snap.forEach((d) => {
      list.push({ ...(d.data() as CivicActionEvent), id: d.id });
    });
    return list;
  } catch (err) {
    console.warn('Failed to fetch events from cloud:', err);
    return [];
  }
}

/**
 * Completely clears all live reports from Cloud Firestore (admin backend data wipe).
 */
export async function clearAllLiveReportsFromCloud(): Promise<number> {
  if (!db) return 0;
  try {
    const colRef = collection(db, REPORTS_COLLECTION);
    const snap = await getDocs(colRef);
    if (snap.empty) return 0;

    const batch = writeBatch(db);
    let count = 0;
    snap.forEach((d) => {
      batch.delete(d.ref);
      count++;
    });
    await batch.commit();
    return count;
  } catch (err) {
    console.error('Failed to clear live reports from cloud:', err);
    throw err;
  }
}

/**
 * Completely clears all civic analytics events from Cloud Firestore.
 */
export async function clearAllCivicEventsFromCloud(): Promise<number> {
  if (!db) return 0;
  try {
    const colRef = collection(db, EVENTS_COLLECTION);
    const snap = await getDocs(colRef);
    if (snap.empty) return 0;

    const batch = writeBatch(db);
    let count = 0;
    snap.forEach((d) => {
      batch.delete(d.ref);
      count++;
    });
    await batch.commit();
    return count;
  } catch (err) {
    console.error('Failed to clear events from cloud:', err);
    throw err;
  }
}

