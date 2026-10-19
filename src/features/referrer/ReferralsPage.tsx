import { useState } from 'react';
import { useForm, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send } from 'lucide-react';
import { formatAgo, formatDay } from '@/lib/crm';
import { humanizeError } from '@/lib/supabase';
import { useReferrals, useSubmitReferral } from '@/features/leads/api';
import { StatusPill } from '@/features/leads/components';
import { CompanyContactFields, companyContactSchema, toPayload, type CompanyContactValues } from '@/features/leads/LeadForm';
import { Alert, Button, Card, EmptyState, Field, PageHeader, Spinner, Textarea } from '@/components/ui';

export function ReferralsPage() {
  const referrals = useReferrals();
  const submit = useSubmitReferral();
  const [sent, setSent] = useState<string | null>(null);
  const form = useForm<CompanyContactValues>({ resolver: zodResolver(companyContactSchema) });

  const onSubmit = form.handleSubmit(async (v) => {
    setSent(null);
    const p = toPayload(v);
    if (!p.contact.phone && !p.contact.email) {
      form.setError('phone', { message: 'Indiquez au moins un téléphone ou un email' });
      return;
    }
    try {
      await submit.mutateAsync(p);
      setSent(v.name);
      form.reset();
    } catch { /* affiché */ }
  });

  return (
    <>
      <PageHeader title="Mes prospects transmis" description="Recommandez une entreprise à Moka Studio et suivez son avancement." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <h2 className="px-4 pb-1 pt-4 text-sm font-semibold">Suivi</h2>
          {referrals.isPending ? (
            <Spinner />
          ) : referrals.isError ? (
            <div className="p-4"><Alert>{humanizeError(referrals.error)}</Alert></div>
          ) : referrals.data.length === 0 ? (
            <EmptyState icon={<Send className="h-8 w-8" />} title="Aucun prospect transmis">
              Utilisez le formulaire pour recommander votre première entreprise.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-beige">
              {referrals.data.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.company_name}</p>
                    <p className="text-xs text-anthracite-500">
                      {r.city ? `${r.city} · ` : ''}transmis le {formatDay(r.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusPill status={r.status} />
                    <p className="mt-0.5 text-[11px] text-anthracite-300">{formatAgo(r.status_changed_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-beige px-4 py-3 text-xs text-anthracite-500">
            Vos commissions apparaissent dans l’espace Commissions dès la signature d’un contrat.
          </p>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Transmettre un prospect</h2>
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <CompanyContactFields register={form.register as UseFormRegister<CompanyContactValues>} errors={form.formState.errors} compact />
            <Field label="Contexte" hint="Besoin exprimé, meilleur moment pour appeler…">
              {(id) => <Textarea id={id} rows={3} {...form.register('notes')} />}
            </Field>
            {sent && <Alert tone="success">« {sent} » a bien été transmis. Merci !</Alert>}
            {submit.isError && <Alert>{humanizeError(submit.error)}</Alert>}
            <Button type="submit" className="w-full" icon={<Send className="h-4 w-4" />} loading={form.formState.isSubmitting}>
              Transmettre
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
