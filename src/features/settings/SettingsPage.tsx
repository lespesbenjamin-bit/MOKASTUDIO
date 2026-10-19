import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { centsToInput, formatBps, formatEuros, parseEuros } from '@/lib/money';
import { OFFER_LABELS, formatDate } from '@/lib/sales';
import { humanizeError } from '@/lib/supabase';
import type { BeneficiaryRole, CommissionRuleRow, OfferCode, OfferRow } from '@/types/database';
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, Spinner } from '@/components/ui';
import { useAppSettings, useOffers, usePublishRule, useRules, useUpdateOffer, useUpdateSettings } from '@/features/sales/api';

// --- Offres ---------------------------------------------------------------------
function OfferRowEditor({ offer }: { offer: OfferRow }) {
  const update = useUpdateOffer();
  const [v, setV] = useState({ monthly: '', setup: '', oneShot: '', months: '' });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setV({
      monthly: centsToInput(offer.monthly_price_cents), setup: centsToInput(offer.setup_fee_cents),
      oneShot: centsToInput(offer.one_shot_price_cents), months: String(offer.commitment_months),
    });
  }, [offer]);

  const save = () => {
    setError(null); setSaved(false);
    const m = parseEuros(v.monthly), s = parseEuros(v.setup), o = parseEuros(v.oneShot), months = Number(v.months);
    if (m === null || s === null || o === null || !Number.isInteger(months) || months < 0 || months > 60) {
      setError('Montant ou durée invalide.');
      return;
    }
    update.mutate(
      { code: offer.code, patch: { monthly_price_cents: m, setup_fee_cents: s, one_shot_price_cents: o, commitment_months: months } },
      { onSuccess: () => setSaved(true), onError: (e) => setError(humanizeError(e)) },
    );
  };

  const isSub = offer.code !== 'vente_directe';
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{OFFER_LABELS[offer.code]}</p>
        <label className="flex items-center gap-2 text-xs text-anthracite-500">
          <input type="checkbox" className="accent-terracotta" checked={offer.is_active}
            onChange={(e) => update.mutate({ code: offer.code, patch: { is_active: e.target.checked } })} />
          Proposée à la vente
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isSub ? (
          <Field label="Prix mensuel (€)">{(id) => <Input id={id} inputMode="decimal" value={v.monthly} onChange={(e) => setV({ ...v, monthly: e.target.value })} />}</Field>
        ) : (
          <Field label="Prix de vente (€)">{(id) => <Input id={id} inputMode="decimal" value={v.oneShot} onChange={(e) => setV({ ...v, oneShot: e.target.value })} />}</Field>
        )}
        {offer.code !== 'option_planning' && (
          <Field label="Mise en service (€)">{(id) => <Input id={id} inputMode="decimal" value={v.setup} onChange={(e) => setV({ ...v, setup: e.target.value })} />}</Field>
        )}
        {offer.code === 'abonnement' && (
          <Field label="Engagement (mois)">{(id) => <Input id={id} inputMode="numeric" value={v.months} onChange={(e) => setV({ ...v, months: e.target.value })} />}</Field>
        )}
        <div className="flex items-end">
          <Button size="sm" variant="secondary" loading={update.isPending} onClick={save}>Enregistrer</Button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {saved && <p className="text-xs text-emerald-700">Tarif enregistré. Les contrats déjà signés gardent leur prix.</p>}
    </div>
  );
}

// --- Grille de commissions ---------------------------------------------------------
const RULE_KEYS: { role: BeneficiaryRole; offer: OfferCode }[] = [
  { role: 'commercial', offer: 'abonnement' }, { role: 'commercial', offer: 'vente_directe' }, { role: 'commercial', offer: 'option_planning' },
  { role: 'apporteur', offer: 'abonnement' }, { role: 'apporteur', offer: 'vente_directe' }, { role: 'apporteur', offer: 'option_planning' },
];

function RuleModal({ rule, target, onClose }: { rule: CommissionRuleRow | undefined; target: { role: BeneficiaryRole; offer: OfferCode } | null; onClose: () => void }) {
  const publish = usePublishRule();
  const [amount, setAmount] = useState('');
  const [split, setSplit] = useState(true);
  const [t1, setT1] = useState('50');
  const [after, setAfter] = useState('3');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    publish.reset(); setError(null);
    setAmount(centsToInput(rule?.amount_cents ?? 0));
    setSplit((rule?.tranche2_bps ?? 0) > 0);
    setT1(String((rule?.tranche1_bps ?? 5000) / 100));
    setAfter(String(rule?.tranche2_after_payments ?? 3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  if (!target) return null;

  const submit = () => {
    setError(null);
    const a = parseEuros(amount);
    const p1 = split ? Math.round(Number(t1.replace(',', '.')) * 100) : 10000;
    const n = Number(after);
    if (a === null) return setError('Montant invalide.');
    if (!Number.isFinite(p1) || p1 <= 0 || p1 > 10000 || (split && p1 === 10000)) return setError('Pourcentage de la 1ʳᵉ tranche invalide (entre 1 et 99).');
    if (split && (!Number.isInteger(n) || n < 1 || n > 36)) return setError('Nombre de mensualités invalide (1 à 36).');
    publish.mutate(
      { role: target.role, offer: target.offer, amount: a, t1: p1, t2: 10000 - p1, after: split ? n : null },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open
      onClose={publish.isPending ? () => undefined : onClose}
      title="Nouvelle version de la règle"
      description={`${target.role === 'commercial' ? 'Commercial' : 'Apporteur'} · ${OFFER_LABELS[target.offer]}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={publish.isPending}>Annuler</Button>
          <Button onClick={submit} loading={publish.isPending}>Publier</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <Field label="Montant de la commission (€)">{(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        {target.offer !== 'vente_directe' && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-terracotta" checked={split} onChange={(e) => setSplit(e.target.checked)} />
            Verser en deux tranches
          </label>
        )}
        {split && target.offer !== 'vente_directe' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="1ʳᵉ tranche (%)" hint="Au 1er encaissement">{(id) => <Input id={id} inputMode="decimal" value={t1} onChange={(e) => setT1(e.target.value)} />}</Field>
            <Field label="2ᵉ tranche après" hint="mensualités encaissées">{(id) => <Input id={id} inputMode="numeric" value={after} onChange={(e) => setAfter(e.target.value)} />}</Field>
          </div>
        ) : (
          <p className="text-anthracite-500">Versée en totalité au premier encaissement.</p>
        )}
        <Alert tone="info">S’applique aux contrats signés à partir de maintenant. Les commissions existantes ne sont pas recalculées.</Alert>
        {(error || publish.isError) && <Alert>{error ?? humanizeError(publish.error)}</Alert>}
      </div>
    </Modal>
  );
}

function describeRule(r: CommissionRuleRow | undefined) {
  if (!r) return '—';
  if (r.amount_cents === 0) return 'Aucune commission';
  if (r.tranche2_bps === 0) return `${formatEuros(r.amount_cents, true)} au 1er encaissement`;
  return `${formatEuros(r.amount_cents, true)} · ${formatBps(r.tranche1_bps)} au 1er encaissement, ${formatBps(r.tranche2_bps)} après ${r.tranche2_after_payments} mensualités`;
}

// --- Hypothèses de gestion -------------------------------------------------------------
function SettingsForm() {
  const settings = useAppSettings();
  const update = useUpdateSettings();
  const [v, setV] = useState({ variable: '', fixed: '', provision: '', hour: '', stale: '' });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const s = settings.data;
    if (s) setV({
      variable: centsToInput(s.variable_cost_per_sub_cents), fixed: centsToInput(s.fixed_costs_monthly_cents),
      provision: String(s.contributions_provision_bps / 100).replace('.', ','), hour: centsToInput(s.creation_hour_cost_cents),
      stale: String(s.stale_lead_days),
    });
  }, [settings.data]);

  if (settings.isPending) return <Spinner />;
  if (settings.isError) return <div className="p-4"><Alert>{humanizeError(settings.error)}</Alert></div>;

  const save = () => {
    setError(null); setSaved(false);
    const variable = parseEuros(v.variable), fixed = parseEuros(v.fixed), hour = parseEuros(v.hour);
    const provision = Math.round(Number(v.provision.replace(',', '.')) * 100);
    const stale = Number(v.stale);
    if (variable === null || fixed === null || hour === null) return setError('Montant invalide.');
    if (!Number.isFinite(provision) || provision < 0 || provision > 10000) return setError('Provision : entre 0 et 100 %.');
    if (!Number.isInteger(stale) || stale < 1 || stale > 365) return setError('Inactivité : entre 1 et 365 jours.');
    update.mutate(
      { variable_cost_per_sub_cents: variable, fixed_costs_monthly_cents: fixed, contributions_provision_bps: provision, creation_hour_cost_cents: hour, stale_lead_days: stale },
      { onSuccess: () => setSaved(true), onError: (e) => setError(humanizeError(e)) },
    );
  };

  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Coût variable par abonnement (€/mois)">{(id) => <Input id={id} inputMode="decimal" value={v.variable} onChange={(e) => setV({ ...v, variable: e.target.value })} />}</Field>
        <Field label="Frais fixes (€/mois)">{(id) => <Input id={id} inputMode="decimal" value={v.fixed} onChange={(e) => setV({ ...v, fixed: e.target.value })} />}</Field>
        <Field label="Provision de cotisations (% du CA encaissé)" hint="Estimation de gestion, pas un calcul fiscal.">
          {(id) => <Input id={id} inputMode="decimal" value={v.provision} onChange={(e) => setV({ ...v, provision: e.target.value })} />}
        </Field>
        <Field label="Coût horaire de création (€)" hint="0 € dans le prévisionnel de trésorerie.">{(id) => <Input id={id} inputMode="decimal" value={v.hour} onChange={(e) => setV({ ...v, hour: e.target.value })} />}</Field>
        <Field label="Prospect inactif après (jours)">{(id) => <Input id={id} inputMode="numeric" value={v.stale} onChange={(e) => setV({ ...v, stale: e.target.value })} />}</Field>
      </div>
      {error && <Alert>{error}</Alert>}
      {saved && <Alert tone="success">Hypothèses enregistrées.</Alert>}
      <div className="flex justify-end"><Button loading={update.isPending} onClick={save}>Enregistrer</Button></div>
    </div>
  );
}

export function SettingsPage() {
  const offers = useOffers();
  const rules = useRules();
  const [target, setTarget] = useState<{ role: BeneficiaryRole; offer: OfferCode } | null>(null);
  const current = (role: BeneficiaryRole, offer: OfferCode) =>
    rules.data?.find((r) => r.beneficiary_role === role && r.offer_code === offer && !r.valid_to);
  const history = (rules.data ?? []).filter((r) => r.valid_to);

  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Tarifs, grille de commissions et hypothèses de gestion."
        actions={<Link to="/parametres/utilisateurs" className="inline-flex h-10 items-center gap-2 rounded-lg border border-beige-300 bg-white px-4 text-sm font-medium hover:bg-creme"><Users className="h-4 w-4" />Utilisateurs</Link>}
      />
      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Offres et tarifs</h2>
          <Card className="divide-y divide-beige">
            {offers.isPending ? <Spinner /> : offers.isError ? <div className="p-4"><Alert>{humanizeError(offers.error)}</Alert></div> :
              (['abonnement', 'vente_directe', 'option_planning'] as OfferCode[]).map((code) => {
                const o = offers.data.find((x) => x.code === code);
                return o ? <OfferRowEditor key={code} offer={o} /> : null;
              })}
          </Card>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Grille de commissions</h2>
          <Card>
            {rules.isPending ? <Spinner /> : rules.isError ? <div className="p-4"><Alert>{humanizeError(rules.error)}</Alert></div> : (
              <ul className="divide-y divide-beige">
                {RULE_KEYS.map((k) => {
                  const r = current(k.role, k.offer);
                  return (
                    <li key={`${k.role}-${k.offer}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          <Badge tone={k.role === 'commercial' ? 'terracotta' : 'neutral'}>{k.role === 'commercial' ? 'Commercial' : 'Apporteur'}</Badge>{' '}
                          {OFFER_LABELS[k.offer]}
                        </p>
                        <p className="mt-0.5 text-xs text-anthracite-500">{describeRule(r)}{r ? ` · depuis le ${formatDate(r.valid_from)}` : ''}</p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setTarget(k)}>Modifier</Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {history.length > 0 && (
              <details className="border-t border-beige px-4 py-3 text-xs text-anthracite-500">
                <summary className="cursor-pointer">Versions précédentes ({history.length})</summary>
                <ul className="mt-2 space-y-1">
                  {history.map((r) => (
                    <li key={r.id}>
                      {r.beneficiary_role === 'commercial' ? 'Commercial' : 'Apporteur'} · {OFFER_LABELS[r.offer_code]} — {describeRule(r)} · du {formatDate(r.valid_from)} au {formatDate(r.valid_to)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Hypothèses de gestion</h2>
          <Card><SettingsForm /></Card>
        </section>
      </div>
      <RuleModal rule={target ? current(target.role, target.offer) : undefined} target={target} onClose={() => setTarget(null)} />
    </>
  );
}
