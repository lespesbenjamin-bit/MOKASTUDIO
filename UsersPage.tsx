import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailPlus, Search, UserPlus } from 'lucide-react';
import { supabase, callAdminUsers, humanizeError } from '@/lib/supabase';
import { ALL_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/roles';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Profile, UserRole } from '@/types/database';
import { Alert, Badge, Button, Card, ConfirmDialog, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui';

const inviteSchema = z.object({
  full_name: z.string().trim().min(1, 'Nom requis').max(120),
  email: z.string().trim().toLowerCase().min(1, 'Email requis').email('Email invalide'),
  role: z.enum(['admin', 'commercial', 'apporteur']),
});
type InviteValues = z.infer<typeof inviteSchema>;

type PendingAction =
  | { kind: 'role'; user: Profile; role: UserRole }
  | { kind: 'active'; user: Profile; active: boolean }
  | { kind: 'resend'; user: Profile };

const QUERY_KEY = ['profiles', 'all'] as const;

export function UsersPage() {
  const { profile: me } = useAuth();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');

  const users = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('full_name');
      if (error) throw error;
      return data;
    },
  });

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (users.data ?? []).filter(
      (u) => (!roleFilter || u.role === roleFilter) && (!q || u.full_name.toLowerCase().includes(q) || u.email.includes(q)),
    );
  }, [users.data, filter, roleFilter]);

  const action = useMutation({
    mutationFn: async (a: PendingAction) => {
      if (a.kind === 'role') {
        const { error } = await supabase.from('profiles').update({ role: a.role }).eq('id', a.user.id);
        if (error) throw error;
        return `${a.user.full_name} est maintenant ${ROLE_LABELS[a.role].toLowerCase()}.`;
      }
      if (a.kind === 'active') {
        await callAdminUsers({ action: 'set_active', user_id: a.user.id, active: a.active });
        return a.active ? `Accès de ${a.user.full_name} réactivé.` : `Accès de ${a.user.full_name} désactivé.`;
      }
      await callAdminUsers({ action: 'resend', user_id: a.user.id });
      return `Lien de connexion renvoyé à ${a.user.email}.`;
    },
    onSuccess: (msg) => {
      setNotice(msg);
      setPending(null);
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const openAction = (a: PendingAction) => {
    action.reset();
    setPending(a);
  };

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Comptes de l'équipe commerciale et des apporteurs d'affaires."
        actions={<Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>Inviter</Button>}
      />

      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}

      <Card>
        <div className="flex flex-col gap-2 border-b border-beige p-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-anthracite-300" aria-hidden />
            <Input
              placeholder="Rechercher par nom ou email"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
              aria-label="Rechercher"
            />
          </div>
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRole | '')} className="sm:w-48" aria-label="Filtrer par rôle">
            <option value="">Tous les rôles</option>
            {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </div>

        {users.isPending ? (
          <Spinner />
        ) : users.isError ? (
          <div className="p-4"><Alert>{humanizeError(users.error)}</Alert></div>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-anthracite-500">
            {users.data.length === 0 ? 'Aucun utilisateur.' : 'Aucun résultat pour ce filtre.'}
          </p>
        ) : (
          <ul className="divide-y divide-beige">
            {visible.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <li key={u.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{u.full_name}</p>
                      {isMe && <Badge tone="muted">Vous</Badge>}
                      {!u.is_active && <Badge tone="warning">Désactivé</Badge>}
                    </div>
                    <p className="truncate text-xs text-anthracite-500">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
                    <Select
                      value={u.role}
                      disabled={isMe}
                      onChange={(e) => openAction({ kind: 'role', user: u, role: e.target.value as UserRole })}
                      className="h-8 !w-48 text-xs"
                      aria-label={`Rôle de ${u.full_name}`}
                    >
                      {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </Select>
                    {!isMe && (
                      <>
                        <Button size="sm" variant="ghost" icon={<MailPlus className="h-3.5 w-3.5" />} onClick={() => openAction({ kind: 'resend', user: u })} title="Renvoyer un lien de connexion">
                          <span className="sr-only sm:not-sr-only">Lien</span>
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openAction({ kind: 'active', user: u, active: !u.is_active })}>
                          {u.is_active ? 'Désactiver' : 'Réactiver'}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(email) => {
          setInviteOpen(false);
          setNotice(`Invitation envoyée à ${email}.`);
          void qc.invalidateQueries({ queryKey: QUERY_KEY });
        }}
      />

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'role' ? 'Changer le rôle'
          : pending?.kind === 'resend' ? 'Renvoyer un lien'
          : pending?.kind === 'active' && !pending.active ? 'Désactiver le compte'
          : 'Réactiver le compte'
        }
        message={
          pending?.kind === 'role' ? (
            <>
              <strong>{pending.user.full_name}</strong> passera de {ROLE_LABELS[pending.user.role]} à{' '}
              <strong>{ROLE_LABELS[pending.role]}</strong>.
              <span className="mt-2 block text-anthracite-500">{ROLE_DESCRIPTIONS[pending.role]}</span>
            </>
          ) : pending?.kind === 'active' ? (
            pending.active
              ? <><strong>{pending.user.full_name}</strong> pourra de nouveau se connecter.</>
              : <><strong>{pending.user.full_name}</strong> ne pourra plus se connecter. Ses données et son historique sont conservés.</>
          ) : pending ? (
            <>Un email avec un lien pour définir son mot de passe sera envoyé à <strong>{pending.user.email}</strong>.</>
          ) : null
        }
        confirmLabel={pending?.kind === 'active' && !pending.active ? 'Désactiver' : 'Confirmer'}
        danger={pending?.kind === 'active' && !pending.active}
        loading={action.isPending}
        error={action.isError ? humanizeError(action.error) : null}
        onConfirm={() => pending && action.mutate(pending)}
        onCancel={() => setPending(null)}
      />
    </>
  );
}

function InviteModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (email: string) => void }) {
  const form = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { role: 'commercial' } });
  const [error, setError] = useState<string | null>(null);
  const role = form.watch('role');

  const close = () => {
    form.reset();
    setError(null);
    onClose();
  };

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await callAdminUsers({ action: 'invite', ...v });
      form.reset();
      onInvited(v.email);
    } catch (e) {
      setError(humanizeError(e));
    }
  });

  return (
    <Modal
      open={open}
      onClose={form.formState.isSubmitting ? () => undefined : close}
      title="Inviter un utilisateur"
      description="La personne recevra un email pour choisir son mot de passe."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={form.formState.isSubmitting}>Annuler</Button>
          <Button type="submit" form="invite-form" loading={form.formState.isSubmitting}>
            Envoyer l'invitation
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nom complet" error={form.formState.errors.full_name?.message}>
          {(id) => <Input id={id} autoFocus invalid={!!form.formState.errors.full_name} {...form.register('full_name')} />}
        </Field>
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(id) => <Input id={id} type="email" invalid={!!form.formState.errors.email} {...form.register('email')} />}
        </Field>
        <Field label="Rôle" hint={ROLE_DESCRIPTIONS[role]}>
          {(id) => (
            <Select id={id} {...form.register('role')}>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          )}
        </Field>
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
