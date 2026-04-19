import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type SignResult = { ok: true } | { ok: false; error: string };

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  /** `true` while we're resolving the initial session on first mount. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<SignResult>;
  signUp: (email: string, password: string) => Promise<SignResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Resolve the current session on mount and subscribe to changes.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignResult> => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<SignResult> => {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
