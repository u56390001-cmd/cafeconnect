"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  type Session,
  type AuthChangeEvent,
} from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";

export async function authFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  // Supabase stores the session under the key `sb-<ref>-auth-token`.
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  // FormData bodies must keep their browser-generated multipart boundary,
  // so only string bodies get the JSON content type.
  return fetch(input, { ...init, headers });
}

async function getAccessToken(): Promise<string | null> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  tenantId: string | null;
  role: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = supabaseBrowser();

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      const supabaseUser = data.session?.user ?? null;
      if (supabaseUser) {
        await adoptUser(supabaseUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) {
          void adoptUser(session.user);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  interface SessionUserLike {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  }

  function shapeUser(
    supabaseUser: SessionUserLike | null | undefined
  ): AuthUser | null {
    if (!supabaseUser) return null;
    const meta = supabaseUser.user_metadata ?? {};
    return {
      uid: supabaseUser.id,
      email: supabaseUser.email ?? null,
      displayName:
        (meta["display_name"] as string | undefined) ??
        (meta["name"] as string | undefined) ??
        null,
      photoURL:
        (meta["avatar_url"] as string | undefined) ??
        (meta["picture"] as string | undefined) ??
        null,
      tenantId: null,
      role: null,
    };
  }

  const adoptUser = async (raw: SessionUserLike | null | undefined) => {
    const shaped =
      shapeUser(raw) ??
      ({
        uid: "",
        email: null,
        displayName: null,
        photoURL: null,
        tenantId: null,
        role: null,
      } as AuthUser);
    setUser(shaped);
    await fetchUserTenant(shaped.uid, shaped);
  };

  const fetchUserTenant = async (uid: string, authUser: AuthUser) => {
    try {
      const res = await authFetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser({
          ...authUser,
          tenantId: data.data?.tenantId || null,
          role: data.data?.role || null,
        });
      }
    } catch {
      setUser(authUser);
    }
  };

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabaseBrowser().auth.signUp({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login?next=/dashboard`,
      },
    });
    if (error) throw error;
  }, []);

  const signOutUser = useCallback(async () => {
    await supabaseBrowser().auth.signOut();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (user) {
      await fetchUserTenant(user.uid, user);
    }
  }, [user]);

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut: signOutUser,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
