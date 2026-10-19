import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DatabaseBackup, Download } from 'lucide-react';
import { supabase, humanizeError, isDemo } from '@/lib/supabase';
import { download, toExcelCsv } from '@/features/import/lib';
import { Alert, Button, Card } from '@/components/ui';

// Client sans typage strict : la sauvegarde parcourt toutes les tables.
const db = supabase as unknown as SupabaseClient;
const PAGE = 1000;

async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

const BACKUP_TABLES = [
  'profiles', 'app_settings', 'offers', 'objectives', 'commission_rules', 'companies', 'contacts', 'leads', 'lead_activities',
  'tasks', 'deals', 'customers', 'contracts', 'subscriptions', 'payments', 'commissions', 'expenses', 'financial_scenarios', 'audit_logs',
  'client_projects', 'project_questionnaires', 'project_files', 'project_tasks', 'project_events', 'project_briefs',
];

type Export = { key: string; label: string; view: string; columns: [string, string, ((v: unknown) => string)?][] };
const euros = (v: unknown) => (Number(v ?? 0) / 100).toFixed(2).replace('.', ',');

const EXPORTS: Export[] = [
  { key: 'prospects', label: 'Prospects', view: 'lead_overview', columns: [
    ['company_name', 'Entreprise'], ['siren', 'SIREN'], ['sector', 'Secteur'], ['address', 'Adresse'], ['postal_code', 'Code postal'],
    ['city', 'Ville'], ['website', 'Site'], ['contact_first_name', 'Prénom'], ['contact_last_name', 'Nom'], ['contact_email', 'Email'],
    ['contact_phone', 'Téléphone'], ['status', 'Statut'], ['source', 'Source'], ['owner_name', 'Responsable'], ['referrer_name', 'Apporteur'],
    ['last_activity_at', 'Dernière activité'], ['next_follow_up_at', 'Prochaine relance'], ['created_at', 'Créé le'], ['notes', 'Notes'],
  ] },
  { key: 'contrats', label: 'Clients & contrats', view: 'contract_overview', columns: [
    ['reference', 'Référence'], ['company_name', 'Client'], ['offer_code', 'Offre'], ['status', 'Statut'],
    ['monthly_price_cents', 'Mensualité (€)', euros], ['planning_monthly_cents', 'Planning (€/mois)', euros], ['setup_fee_cents', 'Mise en service (€)', euros],
    ['one_shot_price_cents', 'Vente directe (€)', euros], ['signed_at', 'Signé le'], ['activated_at', 'Activé le'], ['commitment_end_at', 'Fin d’engagement'],
    ['site_status', 'Site'], ['site_url', 'URL'], ['owner_name', 'Responsable'], ['paid_cents', 'Encaissé (€)', euros], ['pending_cents', 'À encaisser (€)', euros],
  ] },
  { key: 'paiements', label: 'Paiements', view: 'payment_overview', columns: [
    ['contract_reference', 'Contrat'], ['company_name', 'Client'], ['kind', 'Type'], ['period_month', 'Mois'], ['due_on', 'Échéance'],
    ['amount_cents', 'Montant (€)', euros], ['status', 'Statut'], ['paid_at', 'Encaissé le'], ['method', 'Mode'], ['external_ref', 'Référence'],
  ] },
];

export function BackupCard() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const stamp = () => new Date().toISOString().slice(0, 10);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key); setError(null); setDone(null);
    try { setDone(await fn()); }
    catch (e) { setError(humanizeError(e)); }
    finally { setBusy(null); }
  };

  const exportCsv = (x: Export) => run(x.key, async () => {
    const rows = await fetchAll(x.view);
    download(`moka-${x.key}-${stamp()}.csv`, toExcelCsv([
      x.columns.map((c) => c[1]),
      ...rows.map((r) => x.columns.map(([k, , f]) => (f ? f(r[k]) : r[k] == null ? '' : String(r[k])))),
    ]));
    return `${rows.length} ligne${rows.length > 1 ? 's' : ''} exportée${rows.length > 1 ? 's' : ''}.`;
  });

  const backup = () => run('backup', async () => {
    const out: Record<string, unknown> = { exported_at: new Date().toISOString(), format: 'moka-business-hub/1' };
    let total = 0;
    for (const t of BACKUP_TABLES) {
      const rows = await fetchAll(t);
      out[t] = rows;
      total += rows.length;
    }
    download(`moka-sauvegarde-${stamp()}.json`, JSON.stringify(out, null, 2), 'application/json');
    return `Sauvegarde complète : ${BACKUP_TABLES.length} tables, ${total} lignes.`;
  });

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap gap-2">
        {EXPORTS.map((x) => (
          <Button key={x.key} variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />}
            loading={busy === x.key} disabled={busy !== null} onClick={() => void exportCsv(x)}>
            {x.label} (Excel)
          </Button>
        ))}
        <Button size="sm" icon={<DatabaseBackup className="h-3.5 w-3.5" />} loading={busy === 'backup'} disabled={busy !== null || isDemo}
          onClick={() => void backup()}>
          Sauvegarde complète (JSON)
        </Button>
      </div>
      <p className="text-xs text-anthracite-500">
        Les exports Excel s’ouvrent directement dans Excel (accents et séparateur français). La sauvegarde complète contient toutes
        les tables, journal d’audit compris : conservez-la dans un endroit sûr, elle contient des données personnelles.
        Les commissions s’exportent depuis la page Commissions.
      </p>
      {done && <Alert tone="success">{done}</Alert>}
      {error && <Alert>{error}</Alert>}
    </Card>
  );
}
