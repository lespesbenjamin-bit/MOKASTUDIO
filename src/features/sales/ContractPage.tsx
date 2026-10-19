import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatEuros } from '@/lib/money';
import {
  COMMISSION_STATUS_LABELS, COMMISSION_STATUS_TONE, CONTRACT_STATUS_LABELS, CONTRACT_STATUS_TONE, OFFER_LABELS,
  SITE_STATUSES, SITE_STATUS_LABELS, formatDate, todayInput,
} from '@/lib/sales';
import { humanizeError } from '@/lib/supabase';
import type { ContractOverview, ContractStatus, SiteStatus } from '@/types/database';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Textarea } from '@/components/ui';
import { useCommissions, useContract, useContractAction, usePayments, useUpdateSite } from './api';
import { PaymentsTable } from './PaymentsTable';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-anthracite-500">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function SiteCard({ k }: { k: ContractOverview }) {
  const update = useUpdateSite(k.id);
  const [status, setStatus] = useState<SiteStatus>(k.site_status);
  const [url, setUrl] = useState(k.site_url ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  useEffect(() => { setStatus(k.site_status); setUrl(k.site_url ?? ''); }, [k.site_status, k.site_url]);
  const dirty = status !== k.site_status || url !== (k.site_url ?? '');
  const ended = k.status === 'resilie' || k.status === 'annule';

  const save = () => {
    setLocalError(null);
    const clean = url.trim();
    if (status === 'en_ligne' && !clean) return setLocalError('Indiquez l’URL du site pour le passer « en ligne ».');
    if (clean && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(clean.startsWith('http') ? clean : `https://${clean}`)) return setLocalError('URL invalide.');
    update.mutate({ site_status: status, site_url: clean ? (clean.startsWith('http') ? clean : `https://${clean}`) : null });
  };

  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Production du site</h2>
      <div className="grid grid-cols-4 gap-1" aria-hidden>
        {SITE_STATUSES.map((s, i) => (
          <div key={s} className={`h-1.5 rounded-full ${i <= SITE_STATUSES.indexOf(k.site_status) ? 'bg-terracotta' : 'bg-beige'}`} />
        ))}
      </div>
      <Field label="Statut">
        {(id) => (
          <Select id={id} value={status} disabled={ended} onChange={(e) => setStatus(e.target.value as SiteStatus)}>
            {SITE_STATUSES.map((s) => <option key={s} value={s}>{SITE_STATUS_LABELS[s]}</option>)}
          </Select>
        )}
      </Field>
      <Field label="URL du site livré">
        {(id) => <Input id={id} value={url} disabled={ended} placeholder="https://www.client.fr" onChange={(e) => setUrl(e.target.value)} />}
      </Field>
      {k.site_url && (
        <a href={k.site_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-terracotta-700 hover:underline">
          Ouvrir le site <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {status === 'en_ligne' && !k.activated_at && dirty && (
        <p className="text-xs text-anthracite-500">La mise en ligne active le contrat aujourd’hui (début de l’abonnement).</p>
      )}
      {(localError || update.isError) && <Alert>{localError ?? humanizeError(update.error)}</Alert>}
      {dirty && <div className="flex justify-end"><Button size="sm" loading={update.isPending} onClick={save}>Enregistrer</Button></div>}
    </Card>
  );
}

function AdminActions({ k }: { k: ContractOverview }) {
  const action = useContractAction(k.id);
  const [modal, setModal] = useState<'activate' | 'resilie' | 'annule' | null>(null);
  const [date, setDate] = useState(todayInput());
  const [reason, setReason] = useState('');
  if (k.status !== 'signe' && k.status !== 'actif') return null;

  const open = (m: typeof modal) => { action.reset(); setDate(todayInput()); setReason(''); setModal(m); };
  const confirm = () => {
    if (modal === 'activate') action.mutate({ kind: 'activate', date }, { onSuccess: () => setModal(null) });
    else if (modal) action.mutate({ kind: 'end', mode: modal as ContractStatus, date, reason }, { onSuccess: () => setModal(null) });
  };

  return (
    <Card className="space-y-2 p-4">
      <h2 className="text-sm font-semibold">Administration</h2>
      <div className="flex flex-wrap gap-2">
        {!k.activated_at && <Button size="sm" variant="secondary" onClick={() => open('activate')}>Activer</Button>}
        <Button size="sm" variant="secondary" onClick={() => open('resilie')}>Résilier</Button>
        <Button size="sm" variant="ghost" onClick={() => open('annule')}>Annuler le contrat</Button>
      </div>
      <Modal
        open={modal !== null}
        onClose={action.isPending ? () => undefined : () => setModal(null)}
        title={modal === 'activate' ? 'Activer le contrat' : modal === 'resilie' ? 'Résilier le contrat' : 'Annuler le contrat'}
        description={`${k.company_name} · ${k.reference}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)} disabled={action.isPending}>Retour</Button>
            <Button variant={modal === 'activate' ? 'primary' : 'danger'} loading={action.isPending}
              disabled={modal !== 'activate' && !reason.trim()} onClick={confirm}>
              Confirmer
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          {modal === 'activate' && <p className="text-anthracite-700">Date de début de service et de l’abonnement.</p>}
          {modal === 'resilie' && <p className="text-anthracite-700">Fin du service. Les échéances futures non encaissées sont annulées, les commissions encore prévisionnelles aussi. Les commissions acquises sont conservées.</p>}
          {modal === 'annule' && <p className="text-anthracite-700">À utiliser si le contrat n’a jamais été exécuté (erreur, rétractation). Les commissions prévisionnelles sont annulées.</p>}
          <Field label={modal === 'activate' ? 'Date d’activation' : 'Date d’effet'}>
            {(id) => <Input id={id} type="date" value={date} min={k.signed_at} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          {modal !== 'activate' && (
            <Field label="Motif">{(id) => <Textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          )}
          {action.isError && <Alert>{humanizeError(action.error)}</Alert>}
        </div>
      </Modal>
    </Card>
  );
}

export function ContractPage() {
  const { id = '' } = useParams();
  const { role, profile } = useAuth();
  const isAdmin = role === 'admin';
  const contract = useContract(id);
  const payments = usePayments({ contractId: id });
  const commissions = useCommissions({ contractId: id });

  if (contract.isPending) return <Spinner />;
  if (contract.isError) return <Alert>{humanizeError(contract.error)}</Alert>;
  const k = contract.data;
  if (!k) {
    return (
      <Card>
        <EmptyState title="Contrat introuvable">
          Il n’existe pas ou ne vous est pas attribué. <Link to="/clients" className="text-terracotta-700 underline">Retour aux clients</Link>
        </EmptyState>
      </Card>
    );
  }

  const myCommissions = (commissions.data ?? []).filter((c) => isAdmin || c.beneficiary_id === profile?.id);
  const recurring = Number(k.monthly_price_cents) + Number(k.planning_monthly_cents);

  return (
    <>
      <Link to="/clients" className="mb-4 inline-flex items-center gap-1 text-sm text-anthracite-500 hover:text-anthracite">
        <ArrowLeft className="h-4 w-4" /> Clients & contrats
      </Link>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{k.company_name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-anthracite-500">
          <span>{k.reference}</span>
          <Badge tone={CONTRACT_STATUS_TONE[k.status]}>{CONTRACT_STATUS_LABELS[k.status]}</Badge>
          <span aria-hidden>·</span>
          <Link to={`/prospects/${k.lead_id}`} className="text-terracotta-700 hover:underline">Fiche et historique</Link>
          {isAdmin && k.owner_name && <><span aria-hidden>·</span><span>{k.owner_name}</span></>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-2 space-y-4 lg:order-1">
          <Card>
            <div className="flex items-baseline justify-between px-4 pb-1 pt-4">
              <h2 className="text-sm font-semibold">Paiements</h2>
              <p className="text-xs text-anthracite-500">
                Encaissé {formatEuros(k.paid_cents)} · à encaisser {formatEuros(k.pending_cents)}
              </p>
            </div>
            {payments.isPending ? <Spinner /> : payments.isError ? <div className="p-4"><Alert>{humanizeError(payments.error)}</Alert></div> : (
              <PaymentsTable payments={[...payments.data].reverse()} />
            )}
            {isAdmin && k.subscription_status === 'active' && (
              <p className="border-t border-beige px-4 py-2.5 text-xs text-anthracite-500">
                Les mensualités se génèrent chaque mois depuis la page <Link to="/paiements" className="text-terracotta-700 hover:underline">Paiements</Link>.
              </p>
            )}
          </Card>

          <Card>
            <h2 className="px-4 pb-1 pt-4 text-sm font-semibold">{isAdmin ? 'Commissions du contrat' : 'Mes commissions sur ce contrat'}</h2>
            {commissions.isPending ? <Spinner /> : myCommissions.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-anthracite-500">Aucune commission.</p>
            ) : (
              <ul className="divide-y divide-beige">
                {myCommissions.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{isAdmin ? `${c.beneficiary_name} · ` : ''}{OFFER_LABELS[c.offer_code]} — tranche {c.tranche}</p>
                      <p className="text-xs text-anthracite-500">
                        {c.trigger_kind === 'premier_encaissement' ? 'Au premier encaissement' : `Après ${c.required_payments} mensualités encaissées`}
                      </p>
                    </div>
                    <span className="tabular-nums">{formatEuros(c.amount_cents)}</span>
                    <Badge tone={COMMISSION_STATUS_TONE[c.status]}>{COMMISSION_STATUS_LABELS[c.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="order-1 space-y-4 lg:order-2">
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">Contrat</h2>
            <dl className="divide-y divide-beige">
              <Row label="Offre">{OFFER_LABELS[k.offer_code]}{k.with_planning_option ? ' + planning' : ''}</Row>
              {recurring > 0 && <Row label="Mensualité signée">{formatEuros(recurring)}</Row>}
              {k.offer_code === 'vente_directe' && <Row label="Prix de vente">{formatEuros(k.one_shot_price_cents)}</Row>}
              {k.setup_fee_cents > 0 && <Row label="Mise en service">{formatEuros(k.setup_fee_cents)}</Row>}
              <Row label="Signature">{formatDate(k.signed_at)}</Row>
              <Row label="Activation">{k.activated_at ? formatDate(k.activated_at) : <span className="text-anthracite-300">à la mise en ligne</span>}</Row>
              {k.commitment_months > 0 && <Row label="Engagement">{k.commitment_months} mois</Row>}
              {k.commitment_end_at && <Row label="Fin d’engagement">{formatDate(k.commitment_end_at)}</Row>}
              <Row label="Renouvellement">{k.renewal === 'tacite' ? 'Tacite' : k.renewal === 'manuel' ? 'Manuel' : 'Sans objet'}</Row>
              {k.subscription_status === 'active' && k.next_due_on && <Row label="Prochaine échéance">{formatDate(k.next_due_on)}</Row>}
              <Row label="Paiement">
                {k.overdue_payments > 0 ? <span className="text-red-700">{k.overdue_payments} en retard</span>
                  : k.pending_cents > 0 ? <span className="text-amber-700">En attente</span> : <span className="text-emerald-700">À jour</span>}
              </Row>
              {k.terminated_at && <Row label="Fin">{formatDate(k.terminated_at)}</Row>}
            </dl>
            {k.termination_reason && <p className="mt-2 text-xs text-anthracite-500">Motif : {k.termination_reason}</p>}
          </Card>
          <SiteCard k={k} />
          {isAdmin && <AdminActions k={k} />}
        </div>
      </div>
    </>
  );
}
