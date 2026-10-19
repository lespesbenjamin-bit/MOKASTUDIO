import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase, humanizeError } from '@/lib/supabase';
import { Alert, Button, Field, FullPageSpinner, Input } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthProvider';

const schema = z
  .object({
    password: z
      .string()
      .min(10, '10 caractères minimum')
      .regex(/[A-Za-z]/, 'Au moins une lettre')
      .regex(/\d/, 'Au moins un chiffre'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Les mots de passe ne correspondent pas' });

/** Page atteinte depuis l'email d'invitation ou de réinitialisation. */
export function SetPasswordPage() {
  const { session, loading, profile } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  if (loading) return <FullPageSpinner />;

  if (!session) {
    return (
      <AuthLayout title="Lien expiré ou invalide" subtitle="Ce lien a déjà été utilisé ou n'est plus valable.">
        <Link to="/connexion" className="text-sm font-medium text-terracotta-700 hover:underline">
          Demander un nouveau lien depuis la page de connexion
        </Link>
      </AuthLayout>
    );
  }

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(humanizeError(error));
    else navigate('/', { replace: true });
  });

  return (
    <AuthLayout
      title={profile ? `Bienvenue, ${profile.full_name.split(' ')[0]}` : 'Nouveau mot de passe'}
      subtitle="Choisissez votre mot de passe pour accéder au Business Hub."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Mot de passe" hint="10 caractères minimum, avec au moins une lettre et un chiffre." error={form.formState.errors.password?.message}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" autoFocus invalid={!!form.formState.errors.password} {...form.register('password')} />}
        </Field>
        <Field label="Confirmation" error={form.formState.errors.confirm?.message}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" invalid={!!form.formState.errors.confirm} {...form.register('confirm')} />}
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>Enregistrer et continuer</Button>
      </form>
    </AuthLayout>
  );
}
