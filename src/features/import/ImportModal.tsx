import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { SOURCE_LABELS, contactName, dateInputToIso } from '@/lib/crm';
import { humanizeError, supabase } from '@/lib/supabase';
import { keys, useTeam } from '@/features/leads/api';
import type { LeadSource } from '@/types/database';
import { Alert, Button, Field, Input, Modal, Select } from '@/components/ui';
import {
  FIELDS, MAX_ROWS, TEMPLATE_ROWS, cellToString, decodeText, download, guessMapping, parseCsv, prepareRows, toExcelCsv, toTable,
  type Cell, type Mapping, type PreparedRow, type Table,
} from './lib';

const CHUNK = 200;
type Step = 'file' | 'mapping' | 'check' | 'done';
type RowStatus = 'pret' | 'doublon' | 'erreur' | 'importe';
type Result = { status: RowStatus; message?: string };
type Filter = 'tous' | 'pret' | 'doublon' | 'erreur' | 'avertissement';

async function readFile(file: File): Promise<Table> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser');
    const data = (await readSheet(file)) as unknown as Cell[][];
    return toTable(data);
  }
  if (ext === 'csv' || ext === 'txt') return parseCsv(decodeText(await file.arrayBuffer()));
  if (ext === 'xls') throw new Error('Ancien format Excel (.xls) : enregistrez le fichier en .xlsx ou .csv puis réessayez.');
  throw new Error('Format non pris en charge : utilisez un fichier .xlsx ou .csv.');
}

/** Envoie les lignes valides par paquets ; renvoie le résultat de chaque ligne du fichier. */
async function runImport(
  rows: PreparedRow[],
  opts: { source: LeadSource; ownerId: string | null; followUp: string | null; fileName: string },
  dryRun: boolean,
  onProgress: (done: number, total: number) => void,
): Promise<Map<number, Result>> {
  const results = new Map<number, Result>();
  const sendable = rows.filter((r) => !r.error && r.duplicateOf === undefined);
  for (let i = 0; i < sendable.length; i += CHUNK) {
    const chunk = sendable.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc('import_leads', {
      p_rows: chunk.map((r) => ({ company: r.company, contact: r.contact, notes: r.notes })),
      p_source: opts.source,
      p_owner_id: opts.ownerId,
      p_next_follow_up: opts.followUp,
      p_file_name: opts.fileName,
      p_dry_run: dryRun,
    });
    if (error) throw error;
    data!.rows.forEach((r) => {
      const row = chunk[r.line - 1];
      if (!row) return;
      results.set(row.line, {
        status: r.status === 'importe' ? (dryRun ? 'pret' : 'importe') : r.status,
        message: r.message,
      });
    });
    onProgress(Math.min(i + CHUNK, sendable.length), sendable.length);
  }
  return results;
}

function resultFor(row: PreparedRow, server: Map<number, Result>): Result {
  if (row.error) return { status: 'erreur', message: row.error };
  if (row.duplicateOf !== undefined) return { status: 'doublon', message: `Doublon de la ligne ${row.duplicateOf} du fichier` };
  return server.get(row.line) ?? { status: 'pret' };
}

const STATUS_UI: Record<RowStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  pret: { label: 'Prêt', className: 'text-emerald-700', icon: CheckCircle2 },
  importe: { label: 'Importé', className: 'text-emerald-700', icon: CheckCircle2 },
  doublon: { label: 'Doublon', className: 'text-amber-700', icon: AlertTriangle },
  erreur: { label: 'Erreur', className: 'text-red-700', icon: XCircle },
};

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const team = useTeam(open);
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<Mapping>([]);
  const [rows, setRows] = useState<PreparedRow[]>([]);
  const [server, setServer] = useState<Map<number, Result>>(new Map());
  const [source, setSource] = useState<LeadSource>('prospection');
  const [ownerId, setOwnerId] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [filter, setFilter] = useState<Filter>('tous');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [checked, setChecked] = useState(false);

  const reset = () => {
    setStep('file'); setFileName(''); setTable(null); setMapping([]); setRows([]); setServer(new Map());
    setSource('prospection'); setOwnerId(''); setFollowUp(''); setFilter('tous'); setError(null); setProgress(null); setChecked(false);
  };
  const close = () => {
    if (busy) return;
    if (step === 'done') void qc.invalidateQueries({ queryKey: keys.leads });
    reset();
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const t = await readFile(file);
      if (t.rows.length === 0) throw new Error('Le fichier ne contient aucune ligne de données.');
      if (t.rows.length > MAX_ROWS) throw new Error(`Le fichier contient ${t.rows.length} lignes : ${MAX_ROWS} maximum par import. Découpez-le en plusieurs fichiers.`);
      setFileName(file.name);
      setTable(t);
      setMapping(guessMapping(t.headers));
      setStep('mapping');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lecture du fichier impossible.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void onFile(e.dataTransfer.files[0]);
  };

  const opts = () => ({
    source, ownerId: ownerId || null, followUp: dateInputToIso(followUp), fileName,
  });

  const check = async () => {
    if (!table) return;
    const prepared = prepareRows(table, mapping);
    setRows(prepared);
    setServer(new Map());
    setFilter('tous');
    setStep('check');
    setBusy(true);
    setError(null);
    setChecked(false);
    try {
      setServer(await runImport(prepared, opts(), true, (done, total) => setProgress({ done, total })));
      setChecked(true);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const doImport = async () => {
    setBusy(true);
    setError(null);
    const ready = rows.filter((r) => resultFor(r, server).status === 'pret');
    try {
      const res = await runImport(ready, opts(), false, (done, total) => setProgress({ done, total }));
      setServer((prev) => new Map([...prev, ...res]));
      setStep('done');
    } catch (e) {
      setError(`${humanizeError(e)} — une partie des lignes a pu être importée ; relancez l’import, les doublons seront ignorés.`);
    } finally {
      setBusy(false);
      setProgress(null);
      void qc.invalidateQueries({ queryKey: keys.leads });
    }
  };

  const resolved = useMemo(() => rows.map((r) => ({ row: r, result: resultFor(r, server) })), [rows, server]);
  const counts = useMemo(() => {
    const c = { pret: 0, importe: 0, doublon: 0, erreur: 0, avertissement: 0 };
    resolved.forEach(({ row, result }) => {
      c[result.status]++;
      if (row.warnings.length && (result.status === 'pret' || result.status === 'importe')) c.avertissement++;
    });
    return c;
  }, [resolved]);
  const visible = resolved.filter(({ row, result }) =>
    filter === 'tous' ? true
    : filter === 'avertissement' ? row.warnings.length > 0
    : filter === 'pret' ? result.status === 'pret' || result.status === 'importe'
    : result.status === filter);

  const downloadReport = () => {
    const lines = resolved.map(({ row, result }) => [
      row.line, row.company.name ?? '', row.contact.phone ?? '', row.contact.email ?? '',
      STATUS_UI[result.status].label, [result.message, ...row.warnings].filter(Boolean).join(' ; '),
    ]);
    download(`rapport-import-${fileName.replace(/\.[^.]+$/, '')}.csv`,
      toExcelCsv([['Ligne', 'Entreprise', 'Téléphone', 'Email', 'Statut', 'Détail'], ...lines]));
  };

  const nameMapped = mapping.includes('name');
  const stepIndex = { file: 0, mapping: 1, check: 2, done: 3 }[step];

  // --- Rendu ---------------------------------------------------------------------
  let body: ReactNode;
  let footer: ReactNode;

  if (step === 'file') {
    body = (
      <div className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={clsx(
            'flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragOver ? 'border-terracotta bg-terracotta-50' : 'border-beige-300 bg-creme/60',
          )}
        >
          <FileSpreadsheet className="h-10 w-10 text-terracotta" aria-hidden />
          <p className="mt-3 text-sm font-medium">Glissez votre fichier ici</p>
          <p className="mt-1 text-xs text-anthracite-500">Excel (.xlsx) ou CSV · {MAX_ROWS} lignes maximum · 1ʳᵉ ligne = en-têtes</p>
          <input ref={inputRef} type="file" accept=".xlsx,.csv,.txt" className="sr-only" id="import-file" onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button className="mt-4" variant="secondary" loading={busy} icon={<Upload className="h-4 w-4" />} onClick={() => inputRef.current?.click()}>
            Choisir un fichier
          </Button>
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex items-center justify-between gap-3 rounded-lg bg-creme px-3 py-2.5 text-sm">
          <span className="text-anthracite-700">Pas encore de fichier ? Partez du modèle.</span>
          <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => download('modele-import-prospects.csv', toExcelCsv(TEMPLATE_ROWS))}>
            Modèle
          </Button>
        </div>
      </div>
    );
    footer = <Button variant="secondary" onClick={close}>Annuler</Button>;
  } else if (step === 'mapping' && table) {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-anthracite-700">
          <strong>{fileName}</strong> · {table.rows.length} ligne{table.rows.length > 1 ? 's' : ''}. Vérifiez à quoi correspond chaque colonne.
        </p>
        <div className="overflow-hidden rounded-lg border border-beige-300">
          <table className="w-full text-sm">
            <thead className="bg-creme text-xs text-anthracite-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Colonne du fichier</th>
                <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Exemples</th>
                <th className="px-3 py-2 text-left font-medium">Champ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige">
              {table.headers.map((h, i) => {
                const samples = table.rows.map((r) => cellToString(r[i])).filter(Boolean).slice(0, 3);
                return (
                  <tr key={i} className={mapping[i] ? '' : 'bg-creme/40'}>
                    <td className="px-3 py-2 font-medium">{h}</td>
                    <td className="hidden max-w-[220px] truncate px-3 py-2 text-xs text-anthracite-500 sm:table-cell" title={samples.join(' · ')}>
                      {samples.join(' · ') || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={mapping[i] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value as Mapping[number];
                          setMapping((m) => m.map((x, j) => (j === i ? v : v && x === v && v !== 'notes' ? '' : x)));
                        }}
                        className="h-8 text-xs"
                        aria-label={`Champ pour la colonne ${h}`}
                      >
                        <option value="">— Ne pas importer —</option>
                        {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!nameMapped && <Alert>Indiquez la colonne qui contient le nom de l’entreprise.</Alert>}
      </div>
    );
    footer = (
      <>
        <Button variant="secondary" onClick={() => { setStep('file'); setError(null); }}>Changer de fichier</Button>
        <Button onClick={() => void check()} disabled={!nameMapped}>Vérifier les lignes</Button>
      </>
    );
  } else {
    const done = step === 'done';
    body = (
      <div className="space-y-4">
        {!done && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Source">
              {(id) => (
                <Select id={id} value={source} onChange={(e) => setSource(e.target.value as LeadSource)} disabled={busy}>
                  {Object.entries(SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Commercial responsable">
              {(id) => (
                <Select id={id} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={busy}>
                  <option value="">Non attribué</option>
                  {team.data?.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </Select>
              )}
            </Field>
            <Field label="1ʳᵉ relance (facultatif)">
              {(id) => <Input id={id} type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} disabled={busy} />}
            </Field>
          </div>
        )}

        {busy && (
          <div className="rounded-lg bg-creme px-3 py-3 text-sm">
            <p>{done ? 'Import' : step === 'check' && !progress ? 'Vérification' : 'Traitement'} en cours…{progress ? ` ${progress.done} / ${progress.total}` : ''}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-beige">
              <div className="h-full rounded-full bg-terracotta transition-all" style={{ width: progress ? `${(progress.done / Math.max(progress.total, 1)) * 100}%` : '15%' }} />
            </div>
          </div>
        )}

        {done && (
          <Alert tone="success">
            {counts.importe} prospect{counts.importe > 1 ? 's' : ''} importé{counts.importe > 1 ? 's' : ''}
            {ownerId ? ` et attribué${counts.importe > 1 ? 's' : ''} à ${team.data?.find((m) => m.id === ownerId)?.full_name ?? ''}` : ' (à attribuer)'}.
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrer les lignes">
          {([
            ['tous', 'Toutes', rows.length],
            ['pret', done ? 'Importées' : 'Prêtes', done ? counts.importe : counts.pret],
            ['doublon', 'Doublons', counts.doublon],
            ['erreur', 'Erreurs', counts.erreur],
            ['avertissement', 'Avertissements', counts.avertissement],
          ] as [Filter, string, number][]).map(([k, label, n]) => (
            <button
              key={k}
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={clsx(
                'rounded-full border px-3 py-1 text-xs',
                filter === k ? 'border-anthracite bg-anthracite text-white' : 'border-beige-300 hover:bg-creme',
              )}
            >
              {label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          ))}
        </div>

        <div className="max-h-[42vh] overflow-auto rounded-lg border border-beige-300">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-creme text-xs text-anthracite-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Ligne</th>
                <th className="px-3 py-2 text-left font-medium">Entreprise</th>
                <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Contact</th>
                <th className="px-3 py-2 text-left font-medium">Résultat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige">
              {visible.slice(0, 500).map(({ row, result }) => {
                const ui = STATUS_UI[result.status];
                const Icon = ui.icon;
                return (
                  <tr key={row.line}>
                    <td className="px-3 py-2 tabular-nums text-anthracite-500">{row.line}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.company.name ?? <span className="text-anthracite-300">(vide)</span>}</p>
                      <p className="text-xs text-anthracite-500">{[row.company.postal_code, row.company.city].filter(Boolean).join(' ')}</p>
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-anthracite-700 sm:table-cell">
                      {[contactName(row.contact.first_name, row.contact.last_name), row.contact.phone, row.contact.email].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <p className={clsx('flex items-center gap-1 text-xs font-medium', ui.className)}>
                        <Icon className="h-3.5 w-3.5" aria-hidden />{ui.label}
                      </p>
                      {result.message && <p className="text-xs text-anthracite-500">{result.message}</p>}
                      {row.warnings.length > 0 && <p className="text-xs text-amber-700">{row.warnings.join(', ')}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length > 500 && (
            <p className="px-3 py-2 text-xs text-anthracite-500">… {visible.length - 500} lignes de plus : téléchargez le rapport pour tout voir.</p>
          )}
          {visible.length === 0 && <p className="px-3 py-6 text-center text-sm text-anthracite-500">Aucune ligne.</p>}
        </div>
      </div>
    );
    footer = done ? (
      <>
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={downloadReport}>Rapport</Button>
        <Button onClick={() => { close(); navigate(ownerId ? '/prospects' : '/prospects?filtre=a_attribuer'); }}>Voir les prospects</Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={() => setStep('mapping')} disabled={busy}>Retour</Button>
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={downloadReport} disabled={busy} className="hidden sm:inline-flex">
          Rapport
        </Button>
        <Button onClick={() => void doImport()} loading={busy} disabled={busy || !checked || counts.pret === 0}>
          Importer {counts.pret} prospect{counts.pret > 1 ? 's' : ''}
        </Button>
      </>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size={step === 'file' ? 'lg' : 'xl'}
      title="Importer des prospects"
      description={`Étape ${stepIndex + 1} sur 4 · ${['Fichier', 'Colonnes', 'Vérification', 'Terminé'][stepIndex]}`}
      footer={footer}
    >
      {body}
    </Modal>
  );
}
