import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { FileSignature, Search } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { normalizeSearch } from '@/lib/crm';
import { formatEuros } from '@/lib/money';
import {
  CONTRACT_STATUS_LABELS, CONTRACT_STATUS_TONE, OFFER_LABELS, SITE_STATUSES, SITE_STATUS_LABELS, formatDate,
} from '@/lib/sales';
import { humanizeError } from '@/lib/supabase';
import type { ContractStatus, OfferCode, SiteStatus } from '@/types/database';
import { Alert, Badge, Card, EmptyState, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useContracts } from './api';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-anthracite-500">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-anthracite-300">{hint}</p>}
    </Card>
  );
}

export function CustomersPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const contracts = useContracts();
  const [q, setQ] = useState('');
  const [offer, setOffer] = useState<OfferCode | ''>('');
  const [site, setSite] = useState<SiteStatus | ''>('');
  const [status, setStatus] = useState<'en_cours' | ContractStatus | ''>('en_cours');

  const rows = useMemo(() => {
    const n = normalizeSearch(q);
    return (contracts.data ?? []).filter((k) =>
      (!n || normalizeSearch(`${k.company_name} ${k.reference} ${k.city ?? ''}`).includes(n)) &&
      (!offer || k.offer_code === offer) &&
      (!site || k.site_status === site) &&
      (!status || (status === 'en_cours' ? k.status === 'signe' || k.status === 'actif' : k.status === status)));
  }, [contracts.data, q, offer, site, status]);

  const stats = useMemo(() => {
    const all = contracts.data ?? [];
    const live = all.filter((k) => k.status === 'signe' || k.status === 'actif');
    return {
      clients: new Set(live.map((k) => k.customer_id)).size,
      mrr: live.reduce((s, k) => s + (k.subscription_status === 'active' ? Number(k.monthly_amount_cents ?? 0) : 0), 0),
      toProduce: live.filter((k) => k.site_status !== 'en_ligne').length,
      overdue: live.reduce((s, k) => s + k.overdue_payments, 0),
    };
  }, [contracts.data]);

  return (
    <>
      <PageHeader title="Clients & contrats" description="Contrats signés, production des sites et encaissements." />

      {contracts.data && contracts.data.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Clients actifs" value={String(stats.clients)} />
          <Stat label="Abonnements (mensuel)" value={formatEuros(stats.mrr)} hint="Abonnements actifs uniquement" />
          <Stat label="Sites à livrer" value={String(stats.toProduce)} />
          <Stat label="Paiements en retard" value={String(stats.overdue)} />
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-anthracite-300" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client, référence, ville…" className="pl-9" aria-label="Rechercher" />
        </div>
        <div className="grid grid-cols-3 gap-2 lg:flex">
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="lg:!w-40" aria-label="Statut du contrat">
            <option value="en_cours">En cours</option>
            <option value="">Tous</option>
            {(Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).filter((s) => s !== 'brouillon').map((s) => (
              <option key={s} value={s}>{CONTRACT_STATUS_LABELS[s]}</option>
            ))}
          </Select>
          <Select value={offer} onChange={(e) => setOffer(e.target.value as OfferCode | '')} className="lg:!w-40" aria-label="Offre">
            <option value="">Toutes offres</option>
            <option value="abonnement">Abonnement</option>
            <option value="vente_directe">Vente directe</option>
          </Select>
          <Select value={site} onChange={(e) => setSite(e.target.value as SiteStatus | '')} className="lg:!w-40" aria-label="Statut du site">
            <option value="">Tous les sites</option>
            {SITE_STATUSES.map((s) => <option key={s} value={s}>{SITE_STATUS_LABELS[s]}</option>)}
          </Select>
        </div>
      </div>

      <Card>
        {contracts.isPending ? (
          <Spinner />
        ) : contracts.isError ? (
          <div className="p-4"><Alert>{humanizeError(contracts.error)}</Alert></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<FileSignature className="h-8 w-8" />} title={contracts.data.length ? 'Aucun résultat' : 'Aucun client pour l’instant'}>
            {contracts.data.length ? 'Modifiez les filtres.' : 'Convertissez un prospect gagné depuis sa fiche pour créer le premier contrat.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-beige text-xs text-anthracite-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Client</th>
                  <th className="px-4 py-2 text-left font-medium">Offre</th>
                  <th className="hidden px-4 py-2 text-left font-medium md:table-cell">Signé le</th>
                  <th className="px-4 py-2 text-left font-medium">Site</th>
                  <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Mensuel</th>
                  <th className="hidden px-4 py-2 text-left font-medium lg:table-cell">Paiements</th>
                  {role === 'admin' && <th className="hidden px-4 py-2 text-left font-medium lg:table-cell">Responsable</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-beige">
                {rows.map((k) => (
                  <tr key={k.id} onClick={() => navigate(`/clients/${k.id}`)} className="cursor-pointer hover:bg-creme/70">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{k.company_name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-anthracite-500">
                        {k.reference}
                        {k.status !== 'actif' && <Badge tone={CONTRACT_STATUS_TONE[k.status]}>{CONTRACT_STATUS_LABELS[k.status]}</Badge>}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      {OFFER_LABELS[k.offer_code]}
                      {k.with_planning_option && <span className="text-xs text-anthracite-500"> + planning</span>}
                    </td>
                    <td className="hidden px-4 py-2.5 text-anthracite-700 md:table-cell">{formatDate(k.signed_at)}</td>
                    <td className="px-4 py-2.5">
                      <span className={clsx('text-xs font-medium', k.site_status === 'en_ligne' ? 'text-emerald-700' : 'text-anthracite-700')}>
                        {SITE_STATUS_LABELS[k.site_status]}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">
                      {k.subscription_status === 'active' ? formatEuros(k.monthly_amount_cents) : '—'}
                    </td>
                    <td className="hidden px-4 py-2.5 lg:table-cell">
                      {k.overdue_payments > 0 ? (
                        <span className="text-xs font-medium text-red-700">{k.overdue_payments} en retard</span>
                      ) : k.pending_cents > 0 ? (
                        <span className="text-xs text-amber-700">{formatEuros(k.pending_cents)} à encaisser</span>
                      ) : (
                        <span className="text-xs text-emerald-700">À jour</span>
                      )}
                    </td>
                    {role === 'admin' && <td className="hidden px-4 py-2.5 text-anthracite-700 lg:table-cell">{k.owner_name ?? '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
