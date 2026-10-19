import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase, humanizeError } from '@/lib/supabase';
import { Alert, Button, Field, Input } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthProvider';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email requis').email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});
const resetSchema = loginSchema.pick({ email: true });

export function LoginPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const login = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const reset = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  const onLogin = login.handleSubmit(async ({ email, password }) => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(humanizeError(error));
  });

  const onReset = reset.handleSubmit(async ({ email }) => {
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/definir-mot-de-passe`,
    });
    // Supabase répond de la même façon que le compte existe ou non :
    // le message de succès ne révèle donc pas quelles adresses sont inscrites.
    if (error) setError(humanizeError(error));
    else setSent(true);
  });

  if (mode === 'reset') {
    return (
      <AuthLayout title="Mot de passe oublié" subtitle="Recevez un lien pour choisir un nouveau mot de passe.">
        {sent ? (
          <div className="space-y-5">
            <Alert tone="success">Si un compte existe pour cette adresse, un email vient d'être envoyé.</Alert>
            <Button variant="secondary" className="w-full" onClick={() => { setMode('login'); setSent(false); }}>
              Retour à la connexion
            </Button>
          </div>
        ) : (
          <form onSubmit={onReset} className="space-y-4" noValidate>
            <Field label="Email" error={reset.formState.errors.email?.message}>
              {(id) => <Input id={id} type="email" autoComplete="email" autoFocus invalid={!!reset.formState.errors.email} {...reset.register('email')} />}
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" className="w-full" loading={reset.formState.isSubmitting}>Envoyer le lien</Button>
            <button type="button" onClick={() => { setMode('login'); setError(null); }} className="w-full text-center text-sm text-anthracite-500 hover:text-anthracite">
              Retour à la connexion
            </button>
          </form>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Connexion" subtitle="Accédez à votre espace.">
      <form onSubmit={onLogin} className="space-y-4" noValidate>
        <Field label="Email" error={login.formState.errors.email?.message}>
          {(id) => <Input id={id} type="email" autoComplete="email" autoFocus invalid={!!login.formState.errors.email} {...login.register('email')} />}
        </Field>
        <Field label="Mot de passe" error={login.formState.errors.password?.message}>
          {(id) => <Input id={id} type="password" autoComplete="current-password" invalid={!!login.formState.errors.password} {...login.register('password')} />}
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={login.formState.isSubmitting}>Se connecter</Button>
        <button type="button" onClick={() => { setMode('reset'); setError(null); }} className="w-full text-center text-sm text-terracotta-700 hover:underline">
          Mot de passe oublié ?
        </button>
      </form>
      <p className="mt-8 border-t border-beige pt-4 text-center text-xs text-anthracite-500">
        Présenter l’outil ? <a href="/demo" className="font-medium text-terracotta-700 hover:underline">Mode démonstration</a> (données fictives)
      </p>
    </AuthLayout>
  );
}
