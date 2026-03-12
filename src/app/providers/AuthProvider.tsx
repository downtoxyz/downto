'use client';

import {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
} from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type AuthContextType = {
  user: User;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('Missing Auth context');
  }

  return context;
};

export function AuthProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser: User;
}) {
  const [user, setUser] = useState<User>(initialUser);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    // Initialize with SSR data
    setUser(initialUser);
    setIsLoading(false);

    // Listen for auth changes on the client
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) setUser(session.user);
    });

    return () => subscription.unsubscribe();
  }, [initialUser]);

  return (
    <AuthContext.Provider value={{ user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
