import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { auth } from '../lib/auth';
import { rememberLooks } from '../lib/avatars';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let active = true;
    auth.getSession().then((s) => {
      if (!active) return;
      setSession(s);
      setLoading(false);
    });
    const unsubscribe = auth.onChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const userId = session?.user?.id;

  const refreshProfile = useCallback(async () => {
    const p = userId ? await auth.profile(userId) : null;
    if (p) rememberLooks([[p.id, p.avatar_emoji, p.avatar_color]]);
    setProfile(p);
  }, [userId]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    name: profile?.display_name || session?.user?.email?.split('@')[0] || '',
    loading,
    recovering,
    setRecovering,
    refreshProfile,
    signIn: auth.signIn,
    signUp: auth.signUp,
    signOut: auth.signOut,
    resetPassword: auth.resetPassword,
    updatePassword: auth.updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
