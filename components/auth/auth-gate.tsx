"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { ProgrammingScreen } from "@/components/schedule/programming-screen";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { LoginScreen } from "./login-screen";

export function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [authError, setAuthError] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setIsCheckingSession(false);
      return;
    }

    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          setAuthError(error.message);
        }
        setSession(data.session ?? null);
        setIsCheckingSession(false);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setAuthError(error instanceof Error ? error.message : "No se pudo comprobar la sesion.");
        setIsCheckingSession(false);
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthError("");
      setIsCheckingSession(false);
      setIsSigningOut(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    if (!supabase) return;

    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();

    if (error) {
      setAuthError(error.message);
      setIsSigningOut(false);
    }
  };

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-babel-bg text-zinc-300">
        <div className="inline-flex items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-4 py-3 text-sm">
          <Loader2 className="animate-spin text-babel-red" size={16} />
          Comprobando acceso
        </div>
      </main>
    );
  }

  if (!session) {
    return <LoginScreen authError={authError} />;
  }

  return (
    <ProgrammingScreen
      isSigningOut={isSigningOut}
      userEmail={session.user.email ?? ""}
      onSignOut={signOut}
    />
  );
}
