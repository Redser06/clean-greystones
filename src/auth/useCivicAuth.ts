import { useCallback, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { civicFirebase } from '../lib/firebaseClient';

export interface CivicUser {
  uid: string;
  email: string | null;
  towns: string[];
}

export interface SignInResult {
  ok: boolean;
  message?: string;
}

export interface CivicAuthApi {
  user: CivicUser | null;
  ready: boolean;
  isAdmin: (townId: string) => boolean;
  signInWithGoogle: () => Promise<SignInResult>;
  signInWithApple: () => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const NOT_CONFIGURED = 'Firebase Auth is not configured for this build.';

function townsFromUser(claims: Record<string, unknown>): string[] {
  const admin = claims.admin;
  if (!admin || typeof admin !== 'object') return [];
  const towns = (admin as { towns?: unknown }).towns;
  if (!Array.isArray(towns)) return [];
  return towns.filter((town): town is string => typeof town === 'string');
}

async function signInWithProvider(provider: GoogleAuthProvider | OAuthProvider): Promise<SignInResult> {
  const client = civicFirebase();
  if (!client) return { ok: false, message: NOT_CONFIGURED };
  try {
    await signInWithPopup(client.auth, provider);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sign-in failed.';
    return { ok: false, message };
  }
}

/** Auth API for the admin screen. Admin means a town is present on the custom claim. */
export function useCivicAuth(): CivicAuthApi {
  const [user, setUser] = useState<CivicUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const client = civicFirebase();
    if (!client) {
      setUser(null);
      setReady(true);
      return;
    }
    return onAuthStateChanged(client.auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setReady(true);
        return;
      }
      void firebaseUser.getIdTokenResult().then((token) => {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          towns: townsFromUser(token.claims),
        });
        setReady(true);
      });
    });
  }, []);

  const isAdmin = useCallback(
    (townId: string) => Boolean(user?.towns.includes(townId)),
    [user],
  );

  const signInWithGoogle = useCallback(
    () => signInWithProvider(new GoogleAuthProvider()),
    [],
  );

  const signInWithApple = useCallback(
    () => signInWithProvider(new OAuthProvider('apple.com')),
    [],
  );

  const signOut = useCallback(async () => {
    const client = civicFirebase();
    if (!client) return;
    await firebaseSignOut(client.auth);
  }, []);

  return { user, ready, isAdmin, signInWithGoogle, signInWithApple, signOut };
}
