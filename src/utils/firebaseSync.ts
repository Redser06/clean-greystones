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
  Unsubscribe,
} from 'firebase/firestore';
import { FoulingReport } from '../types';

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
