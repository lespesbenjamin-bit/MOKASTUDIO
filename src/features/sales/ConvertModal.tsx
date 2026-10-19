import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatEuros, centsToInput, parseEuros } from '@/lib/money';
import { OFFER_LABELS, todayInput } from '@/lib/sales';
import { humanizeError } from '@/lib/supabase';
import type { OfferCode } from '@/types/database';
import { Alert, Button, Field, Input, Modal } from '@/components/ui';
import { useConvertLead, useOffers } from './api';

export function ConvertModal({ open, onClose, leadId, companyName }: {
  open: boolean; onClose: () => void; leadId: string; companyName: string;
}) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const navigate = useNavigate();
  const offers = useOffers();
  const convert = useConvertLead();

  const [offer, setOffer] = useState<OfferCode>('abonnement');
  const [planning, setPlanning] = useState(false);
  const [signedAt, setSignedAt] = useState(todayInput());
  const [activatedAt, setActivatedAt] = useState('');
  const [prices, setPrices] = useState({ monthly: '', setup: '', oneShot: '' });
  const [priceError, setPriceError] = useState<string | null>(null);

  const catalog = (code: OfferCode) => offers.data?.find((o) => o.code === code);
  const abo = catalog('abonnement');
  const direct = catalog('vente_directe');
  const plan = catalog('option_planning');

  useEffect(() => {
    if (!open) return;
    convert.reset();
    setOffer('abonnement'); setPlanning(false); setSignedAt(todayInput()); setActivatedAt(''); setPriceError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    setPrices({
      monthly: centsToInput(abo?.monthly_price_cents),
      setup: centsToInput(offer === 'abonnement' ? abo?.setup_fee_cents : direct?.setup_fee_cents),
      oneShot: centsToInput(direct?.one_shot_price_cents),
    });
  }, [offer, abo, direct, open]);

  const monthly = offer === 'abonnement' ? parseEuros(prices.monthly) ?? 0 : 0;
  const recurring = monthly + (planning ? plan?.monthly_price_cents ?? 0 : 0);

  const submit = () => {
    setPriceError(null);
    let override: { monthly?: number | null; setup?: number | null; oneShot?: number | null } = {};
    if (isAdmin) {
      const m = parseEuros(prices.monthly), s = parseEuros(prices.setup), o = parseEuros(prices.oneShot);
      if ((offer === 'abonnement' && (m === null || m <= 0)) || s === null || (offer === 'vente_directe' && (o === null || o <= 0))) {
        setPriceError('Montant invalide (ex. 29 ou 29,90).');
        return;
      }
      override = offer === 'abonnement' ? { monthly: m, setup: s } : { oneShot: o, setup: s };
    }
    convert.mutate(
      { leadId, offer, planning, signedAt, activatedAt: activatedAt || null, ...override },
      { onSuccess: (contractId) => { onClose(); navigate(`/clients/${contractId}`); } },
    );
  };

  const offerCard = (code: OfferCode, title: string, detail: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={offer === code}
      onClick={() => setOffer(code)}
      className={clsx(
        'rounded-xl border p-3 text-left transition-colors',
        offer === code ? 'border-terracotta bg-terracotta-50 ring-1 ring-terracotta' : 'border-beige-300 hover:bg-creme',
      )}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs text-anthracite-500">{detail}</p>
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={convert.isPending ? () => undefined : onClose}
      title="Convertir en client"
      description={companyName}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={convert.isPending}>Annuler</Button>
          <Button onClick={submit} loading={convert.isPending} disabled={!offers.data}>Créer le contrat</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div role="radiogroup" aria-label="Offre" className="grid gap-2 sm:grid-cols-2">
          {offerCard('abonnement', OFFER_LABELS.abonnement,
            abo ? `${formatEuros(abo.monthly_price_cents, true)}/mois · ${formatEuros(abo.setup_fee_cents, true)} de mise en service · ${abo.commitment_months} mois` : '…')}
          {offerCard('vente_directe', OFFER_LABELS.vente_directe,
            direct ? `${formatEuros(direct.one_shot_price_cents, true)} · une modification par trimestre` : '…')}
        </div>

        {plan?.is_active && (
          <label className="flex items-center gap-2 rounded-lg border border-beige-300 px-3 py-2.5 text-sm">
            <input type="checkbox" checked={planning} onChange={(e) => setPlanning(e.target.checked)} className="accent-terracotta" />
            Option planning (+{formatEuros(plan.monthly_price_cents, true)}/mois)
          </label>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date de signature">
            {(id) => <Input id={id} type="date" value={signedAt} max={todayInput()} onChange={(e) => setSignedAt(e.target.value)} />}
          </Field>
          <Field label="Date d’activation" hint="Laisser vide : activée à la mise en ligne du site.">
            {(id) => <Input id={id} type="date" value={activatedAt} min={signedAt} onChange={(e) => setActivatedAt(e.target.value)} />}
          </Field>
        </div>

        {isAdmin ? (
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium uppercase tracking-wider text-anthracite-500">Prix signés (modifiables par l’admin)</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {offer === 'abonnement' ? (
                <Field label="Mensualité (€)">{(id) => <Input id={id} inputMode="decimal" value={prices.monthly} onChange={(e) => setPrices({ ...prices, monthly: e.target.value })} />}</Field>
              ) : (
                <Field label="Prix de vente (€)">{(id) => <Input id={id} inputMode="decimal" value={prices.oneShot} onChange={(e) => setPrices({ ...prices, oneShot: e.target.value })} />}</Field>
              )}
              <Field label="Frais de mise en service (€)">{(id) => <Input id={id} inputMode="decimal" value={prices.setup} onChange={(e) => setPrices({ ...prices, setup: e.target.value })} />}</Field>
            </div>
          </fieldset>
        ) : (
          <p className="text-xs text-anthracite-500">Les prix du catalogue sont appliqués et figés dans le contrat.</p>
        )}

        <div className="rounded-lg bg-creme px-3 py-2.5 text-sm">
          {recurring > 0 && <p>Abonnement mensuel : <strong>{formatEuros(recurring)}</strong></p>}
          {offer === 'vente_directe' && <p>À encaisser à la signature : <strong>{formatEuros(isAdmin ? parseEuros(prices.oneShot) ?? 0 : direct?.one_shot_price_cents)}</strong></p>}
          {offer === 'abonnement' && <p>Mise en service : <strong>{formatEuros(isAdmin ? parseEuros(prices.setup) ?? 0 : abo?.setup_fee_cents)}</strong></p>}
          <p className="mt-1 text-xs text-anthracite-500">Les commissions prévisionnelles sont créées automatiquement.</p>
        </div>

        {priceError && <Alert>{priceError}</Alert>}
        {convert.isError && <Alert>{humanizeError(convert.error)}</Alert>}
      </div>
    </Modal>
  );
}
