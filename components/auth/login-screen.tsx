"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

type LoginScreenProps = {
  authError?: string;
};

export function LoginScreen({ authError }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(authError ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!supabase || !isSupabaseConfigured) {
      setError("Supabase no esta configurado. Revisa las variables de entorno.");
      return;
    }

    if (!email.trim() || !password) {
      setError("Introduce email y contrasena.");
      return;
    }

    setIsSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (signInError) {
      setError("No se pudo iniciar sesion. Revisa email y contrasena.");
    }

    setIsSubmitting(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-babel-bg px-4 text-white">
      <section className="w-full max-w-sm rounded-md border border-babel-line bg-babel-panel p-5 shadow-2xl shadow-black/30">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-babel-red/15 text-babel-red">
            <LockKeyhole size={20} />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-babel-red">
              Cines Babel
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-normal">Acceso interno</h1>
          </div>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm text-zinc-300">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-babel-line bg-zinc-950/40 px-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-babel-red"
              placeholder="equipo@cinesbabel.com"
            />
          </label>

          <label className="block text-sm text-zinc-300">
            Contrasena
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-babel-line bg-zinc-950/40 px-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-babel-red"
              placeholder="Introduce tu contrasena"
            />
          </label>

          {error ? (
            <div className="rounded-md border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {!isSupabaseConfigured ? (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-950/20 px-3 py-2 text-sm text-yellow-100">
              Falta configurar Supabase para poder iniciar sesion.
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || !isSupabaseConfigured}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-babel-red px-4 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
            {isSubmitting ? "Entrando" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
