import { useEffect, useState } from 'react';
import { useForm, type UseFormRegister, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { SOURCE_LABELS, dateInputToIso } from '@/lib/crm';
import { humanizeError } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { Alert, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { findDuplicates, useCreateLead, useTeam } from './api';
import { DuplicateWarning } from './components';
import type { DuplicateMatch, LeadSource } from './types';

const optional = z.string().trim().optional().default('');

export const companyContactSchema = z.object({
  name: z.string().trim().min(1, 'Nom de l’entreprise requis').max(200),
  siren: optional.refine((v) => !v || /^\d{9}$/.test(v.replace(/\s/g, '')), 'Le SIREN comporte 9 chiffres'),
  sector: optional,
  address: optional,
  postal_code: optional.refine((v) => !v || /^\d{5}$/.test(v), 'Code postal à 5 chiffres'),
  city: optional,
  website: optional,
  first_name: optional,
  last_name: optional,
  email: optional.refine((v) => !v || z.string().email().safeParse(v).success, 'Email invalide'),
  phone: optional.refine((v) => !v || /^[+\d][\d\s.()-]{7,19}$/.test(v), 'Téléphone invalide'),
  notes: optional,
});
export type CompanyContactValues = z.infer<typeof companyContactSchema>;

const leadSchema = companyContactSchema.extend({
  source: z.enum(['prospection', 'apporteur', 'site_web', 'recommandation', 'reseaux_sociaux', 'salon', 'autre']),
  owner_id: z.string().optional().default(''),
  next_follow_up: z.string().optional().default(''),
});
type LeadValues = z.infer<typeof leadSchema>;

const nn = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function toPayload(v: CompanyContactValues) {
  return {
    company: {
      name: v.name.trim(), siren: nn(v.siren?.replace(/\s/g, '')), sector: nn(v.sector), address: nn(v.address),
      postal_code: nn(v.postal_code), city: nn(v.city), website: nn(v.website),
    },
    contact: { first_name: nn(v.first_name), last_name: nn(v.last_name), email: nn(v.email), phone: nn(v.phone) },
    notes: nn(v.notes),
  };
}

/** Champs entreprise + contact, partagés avec le formulaire apporteur */
export function CompanyContactFields({
  register, errors, compact,
}: { register: UseFormRegister<CompanyContactValues>; errors: FieldErrors<CompanyContactValues>; compact?: boolean }) {
  return (
    <>
      <fieldset className="space-y-3">
        <legend className="mb-1 text-xs font-medium uppercase tracking-wider text-anthracite-500">Entreprise</legend>
        <Field label="Nom de l’entreprise *" error={errors.name?.message}>
          {(id) => <Input id={id} autoFocus invalid={!!errors.name} {...register('name')} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ville" error={errors.city?.message}>{(id) => <Input id={id} {...register('city')} />}</Field>
          <Field label="Code postal" error={errors.postal_code?.message}>
            {(id) => <Input id={id} inputMode="numeric" invalid={!!errors.postal_code} {...register('postal_code')} />}
          </Field>
        </div>
        {!compact && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Secteur d’activité">{(id) => <Input id={id} placeholder="Coiffure, BTP…" {...register('sector')} />}</Field>
              <Field label="SIREN (facultatif)" error={errors.siren?.message}>
                {(id) => <Input id={id} inputMode="numeric" invalid={!!errors.siren} {...register('siren')} />}
              </Field>
            </div>
            <Field label="Adresse">{(id) => <Input id={id} {...register('address')} />}</Field>
          </>
        )}
        <Field label="Site internet existant">
          {(id) => <Input id={id} placeholder="www.exemple.fr" {...register('website')} />}
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-xs font-medium uppercase tracking-wider text-anthracite-500">Contact</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prénom">{(id) => <Input id={id} autoComplete="off" {...register('first_name')} />}</Field>
          <Field label="Nom">{(id) => <Input id={id} autoComplete="off" {...register('last_name')} />}</Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Téléphone" error={errors.phone?.message}>
            {(id) => <Input id={id} type="tel" invalid={!!errors.phone} {...register('phone')} />}
          </Field>
          <Field label="Email" error={errors.email?.message}>
            {(id) => <Input id={id} type="email" invalid={!!errors.email} {...register('email')} />}
          </Field>
        </div>
      </fieldset>
    </>
  );
}

/** Vérifie les doublons pendant la saisie (avec un léger délai) */
export function useDuplicateCheck(values: { siren?: string; email?: string; phone?: string; website?: string }) {
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const key = JSON.stringify(values);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      findDuplicates(values)
        .then((m) => { if (!cancelled) setMatches(m); })
        .catch(() => { if (!cancelled) setMatches([]); });
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return matches;
}

export function NewLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role, profile } = useAuth();
  const isAdmin = role === 'admin';
  const navigate = useNavigate();
  const team = useTeam(isAdmin);
  const create = useCreateLead();
  const [force, setForce] = useState(false);

  const form = useForm<LeadValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: { source: 'prospection', owner_id: isAdmin ? '' : profile?.id ?? '' },
  });
  const [siren, email, phone, website] = form.watch(['siren', 'email', 'phone', 'website']);
  const matches = useDuplicateCheck({ siren, email, phone, website });
  const blocking = matches.some((m) => m.is_blocking);
  const sirenBlock = matches.some((m) => m.match_kind === 'siren');

  const close = () => {
    form.reset();
    create.reset();
    setForce(false);
    onClose();
  };

  const onSubmit = form.handleSubmit(async (v) => {
    const p = toPayload(v);
    try {
      const id = await create.mutateAsync({
        company: p.company, contact: p.contact, notes: p.notes,
        source: v.source as LeadSource,
        ownerId: isAdmin ? v.owner_id || null : profile?.id ?? null,
        nextFollowUp: dateInputToIso(v.next_follow_up ?? ''),
        force,
      });
      close();
      navigate(`/prospects/${id}`);
    } catch {
      /* message affiché via create.error */
    }
  });

  return (
    <Modal
      open={open}
      onClose={form.formState.isSubmitting ? () => undefined : close}
      title="Nouveau prospect"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={form.formState.isSubmitting}>Annuler</Button>
          <Button
            type="submit"
            form="new-lead-form"
            loading={form.formState.isSubmitting}
            disabled={blocking && (!isAdmin || !force || sirenBlock)}
          >
            Créer le prospect
          </Button>
        </>
      }
    >
      <form id="new-lead-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        <CompanyContactFields
          register={form.register as unknown as UseFormRegister<CompanyContactValues>}
          errors={form.formState.errors}
        />
        <DuplicateWarning matches={matches} isAdmin={isAdmin} />
        {blocking && isAdmin && !sirenBlock && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="accent-terracotta" />
            Créer quand même (doublon assumé)
          </label>
        )}

        <fieldset className="space-y-3">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wider text-anthracite-500">Suivi</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source">
              {(id) => (
                <Select id={id} {...form.register('source')}>
                  {Object.entries(SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Prochaine relance">{(id) => <Input id={id} type="date" {...form.register('next_follow_up')} />}</Field>
          </div>
          {isAdmin && (
            <Field label="Commercial responsable">
              {(id) => (
                <Select id={id} {...form.register('owner_id')}>
                  <option value="">Non attribué</option>
                  {team.data?.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </Select>
              )}
            </Field>
          )}
          <Field label="Notes">{(id) => <Textarea id={id} rows={2} {...form.register('notes')} />}</Field>
        </fieldset>
        {create.isError && <Alert>{humanizeError(create.error)}</Alert>}
      </form>
    </Modal>
  );
}
