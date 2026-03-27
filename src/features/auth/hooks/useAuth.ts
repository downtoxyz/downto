"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";
import { logError } from "@/lib/logger";

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    const handleSession = async (session: Session | null) => {
      try {
        if (session?.user) {
          setIsLoggedIn(true);
          setUserId(session.user.id);

          try {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
            if (data) {
              setProfile(data as Profile);
            }
          } catch {
            // Profile fetch failed — app will work without it
          }
        }
      } catch (err) {
        logError("authSession", err);
      } finally {
        setIsLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
          handleSession(session);
        } else if (event === "SIGNED_OUT") {
          setIsLoggedIn(false);
          setUserId(null);
          setProfile(null);
          setIsLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    isLoggedIn,
    setIsLoggedIn,
    isLoading,
    userId,
    setUserId,
    profile,
    setProfile,
  };
}
