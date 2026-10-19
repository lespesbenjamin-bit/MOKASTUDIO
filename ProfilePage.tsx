import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase, humanizeError } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { ROLE_LABELS } from '@/lib/roles';
import { Alert, Badge, Button, Card, Field, Input, PageHeader } from '@/components/ui';

const schema = z.object({
  full_name: z.string().trim().min(1, 'Nom requis').max(120, '120 caractères maximum'),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[+\d][\d\s.()-]{7,19}$/.test(v), 'Numéro invalide'),
});
type FormValues = z.infer<typeof schema>;

export function ProfilePage() {
  const { profile, role, refreshProfile } = useAuth();
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; msg: string } | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: { full_name: profile?.full_name ?? '', phone: profile?.phone ?? '' },
  });

  if (!profile || !role) return null;

  const onSubmit = form.handleSubmit(async (v) => {
    setStatus(null);
    // Seuls nom et téléphone sont modifiables (garde-fou côté base)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: v.full_name, phone: v.phone || null })
      .eq('id', profile.id);
    if (error) return setStatus({ tone: 'error', msg: humanizeError(error) });
    await refreshProfile();
    setStatus({ tone: 'success', msg: 'Profil enregistré.' });
  });

  return (
    <>
      <PageHeader title="Mon profil" />
      <Card className="max-w-lg p-5">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-anthracite-500">{profile.email}</span>
          <Badge tone="terracotta">{ROLE_LABELS[role]}</Badge>
        </div>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Nom complet" error={form.formState.errors.full_name?.message}>
            {(id) => <Input id={id} autoComplete="name" invalid={!!form.formState.errors.full_name} {...form.register('full_name')} />}
          </Field>
          <Field label="Téléphone" error={form.formState.errors.phone?.message}>
            {(id) => <Input id={id} type="tel" autoComplete="tel" invalid={!!form.formState.errors.phone} {...form.register('phone')} />}
          </Field>
          {status && <Alert tone={status.tone}>{status.msg}</Alert>}
          <div className="flex justify-end">
            <Button type="submit" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>Enregistrer</Button>
          </div>
        </form>
        <p className="mt-5 border-t border-beige pt-4 text-xs text-anthracite-500">
          L'email et le rôle sont gérés par l'administrateur. Pour changer de mot de passe, déconnectez-vous puis utilisez
          « Mot de passe oublié ».
        </p>
      </Card>
    </>
  );
}
