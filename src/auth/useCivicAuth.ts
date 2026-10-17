import { useCallback, useEffect, useState } from 'react';
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

async function authClient() {
  const [auth, client] = await Promise.all([import('firebase/auth'), civicFirebase()]);
  return { auth, client };
}

/** Auth API for the admin screen. Admin means a town is present on the custom claim. */
export function useCivicAuth(): CivicAuthApi {
  const [user, setUser] = useState<CivicUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    void (async () => {
      const { auth, client } = await authClient();
      if (cancelled) return;
      if (!client) {
        setUser(null);
        setReady(true);
        return;
      }
      unsubscribe = auth.onAuthStateChanged(client.auth, (firebaseUser) => {
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
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const isAdmin = useCallback(
    (townId: string) => Boolean(user?.towns.includes(townId)),
    [user],
  );

  const signInWithGoogle = useCallback(async () => {
    const { auth, client } = await authClient();
    if (!client) return { ok: false, message: NOT_CONFIGURED };
    try {
      await auth.signInWithPopup(client.auth, new auth.GoogleAuthProvider());
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign-in failed.';
      return { ok: false, message };
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    const { auth, client } = await authClient();
    if (!client) return { ok: false, message: NOT_CONFIGURED };
    try {
      await auth.signInWithPopup(client.auth, new auth.OAuthProvider('apple.com'));
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign-in failed.';
      return { ok: false, message };
    }
  }, []);

  const signOut = useCallback(async () => {
    const { auth, client } = await authClient();
    if (!client) return;
    await auth.signOut(client.auth);
  }, []);

  return { user, ready, isAdmin, signInWithGoogle, signInWithApple, signOut };
}
