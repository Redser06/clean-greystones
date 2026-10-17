import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export function readFirebaseWebConfig(
  env: ImportMetaEnv = import.meta.env,
): FirebaseWebConfig | null {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: env.VITE_FIREBASE_APP_ID ?? '',
  };
  if (!config.apiKey || !config.projectId || !config.appId) return null;
  return config;
}

export interface CivicFirebase {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

let pending: Promise<CivicFirebase | null> | null = null;

export function civicFirebase(): Promise<CivicFirebase | null> {
  const config = readFirebaseWebConfig();
  if (!config) return Promise.resolve(null);
  if (!pending) pending = loadFirebase(config);
  return pending;
}

async function loadFirebase(config: FirebaseWebConfig): Promise<CivicFirebase> {
  const [{ initializeApp }, { getAuth }, { getFirestore }, { getStorage }] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
    import('firebase/storage'),
  ]);
  const app = initializeApp(config);
  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    storage: getStorage(app),
  };
}
