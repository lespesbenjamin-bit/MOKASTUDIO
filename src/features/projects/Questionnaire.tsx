// Questionnaire « Projet client » en 6 étapes, partagé entre :
//  * le portail client (lien personnel, sans compte) ;
//  * la saisie par le commercial pendant le rendez-vous.
// Sauvegarde automatique (1,2 s après la dernière frappe et à chaque changement d'étape).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, CloudOff, FileText, Image as ImageIcon, Loader2, Paperclip,
  Pencil, Send, Trash2, Upload,
} from 'lucide-react';
import { formatEuros } from '@/lib/money';
import { humanizeError } from '@/lib/supabase';
import type { PortalFile } from '@/types/database';
import {
  AMBIANCES, FILE_CATEGORIES, STEPS, completion, displayValue, formatError, isFilled, missingInfo, showPlanningInfo,
  visibleFields, type Answers, type Field, type Option,
} from './questions';

export type QuestionnaireBackend = {
  save: (patch: Answers, step: number, completion: number) => Promise<unknown>;
  submit: () => Promise<unknown>;
  upload: (category: string, file: File) => Promise<void>;
  remove: (fileId: string) => Promise<void>;
  refreshFiles: () => Promise<PortalFile[]>;
};

type Props = {
  initialAnswers: Answers;
  initialStep: number;
  files: PortalFile[];
  mode: 'client' | 'equipe';
  backend: QuestionnaireBackend;
  planningMonthlyCents: number | null;
  privacy: ReactNode;
  missingMessage?: string | null;
  readOnly?: boolean;
  /** Questionnaire déjà transmis : pas de nouveau bouton d'envoi */
  submittedAt?: string | null;
  /** Le client peut retirer ses propres documents ; l'équipe tous */
  canRemove?: (f: PortalFile) => boolean;
  onSubmitted: () => void;
  onSaveLater?: () => void;
};

type SaveState = { kind: 'idle' | 'saving' | 'saved' | 'error'; at?: Date; message?: string };

export function Questionnaire(props: Props) {
  const { backend, mode, readOnly } = props;
  const [answers, setAnswers] = useState<Answers>(props.initialAnswers);
  const [files, setFiles] = useState<PortalFile[]>(props.files);
  const [step, setStep] = useState(Math.min(Math.max(props.initialStep, 0), STEPS.length - 1));
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const filesRef = useRef(files);
  filesRef.current = files;
  const stepRef = useRef(step);
  stepRef.current = step;
  const pending = useRef<Answers>({});
  const timer = useRef<number | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback((force = false) => {
    window.clearTimeout(timer.current);
    chain.current = chain.current.then(async () => {
      const patch = pending.current;
      if (!force && !Object.keys(patch).length) return;
      if (readOnly) return;
      pending.current = {};
      setSave({ kind: 'saving' });
      try {
        await backend.save(patch, stepRef.current, completion(answersRef.current, filesRef.current));
        setSave({ kind: 'saved', at: new Date() });
      } catch (e) {
        pending.current = { ...patch, ...pending.current }; // on réessaiera
        setSave({ kind: 'error', message: humanizeError(e) });
      }
    });
    return chain.current;
  }, [backend, readOnly]);

  const set = (key: string, value: Answers[string]) => {
    if (readOnly) return;
    setAnswers((a) => ({ ...a, [key]: value }));
    pending.current[key] = value;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 1200);
  };

  // Avertit avant de quitter avec des réponses non enregistrées
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) { void flush(); e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onLeave);
    return () => { window.removeEventListener('beforeunload', onLeave); window.clearTimeout(timer.current); };
  }, [flush]);

  const top = useRef<HTMLDivElement>(null);
  const goTo = (n: number) => {
    const next = Math.min(Math.max(n, 0), STEPS.length - 1);
    setStep(next);
    stepRef.current = next;
    void flush(true);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const current = STEPS[step]!;
  const pct = completion(answers, files);
  const missing = useMemo(() => missingInfo(answers, files), [answers, files]);
  const isRecap = current.id === 'recap';

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await flush(true);
      if (Object.keys(pending.current).length) throw new Error('Vos dernières réponses n’ont pas pu être enregistrées. Vérifiez votre connexion.');
      await backend.submit();
      props.onSubmitted();
    } catch (e) {
      setSubmitError(humanizeError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const saveLater = async () => {
    await flush(true);
    if (!Object.keys(pending.current).length) props.onSaveLater?.();
  };

  return (
    <div ref={top} className="scroll-mt-4">
      <Progress step={step} pct={pct} onGo={goTo} />

      {props.missingMessage && (
        <div className="mb-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div><p className="font-medium">Moka Studio a besoin de quelques compléments :</p><p className="mt-0.5 whitespace-pre-line">{props.missingMessage}</p></div>
        </div>
      )}

      <section className="rounded-3xl border border-beige-300/80 bg-white p-5 shadow-[0_1px_2px_rgba(41,39,36,.04),0_12px_32px_-16px_rgba(41,39,36,.12)] sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-terracotta">Étape {step + 1} sur {STEPS.length}</p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-anthracite sm:text-3xl">{current.title}</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-anthracite-500">{current.intro}</p>

        {!isRecap && (
          <div className="mt-7 grid gap-x-5 gap-y-6 sm:grid-cols-2">
            {visibleFields(current, answers).map((f) => (
              <div key={f.key} className={f.half ? '' : 'sm:col-span-2'}>
                <FieldInput field={f} value={answers[f.key]} onChange={(v) => set(f.key, v)} disabled={readOnly} />
              </div>
            ))}
          </div>
        )}

        {current.id === 'contenus' && (
          <FilesPanel
            files={files} disabled={readOnly && mode === 'client'} backend={backend} canRemove={props.canRemove}
            onChange={async () => setFiles(await backend.refreshFiles())}
          />
        )}

        {current.id === 'fonctionnalites' && showPlanningInfo(answers) && (
          <div className="mt-6 rounded-2xl border border-terracotta-100 bg-terracotta-50/60 p-4 text-sm text-anthracite-700">
            <p className="font-medium text-terracotta-700">Option planning Moka Studio</p>
            <p className="mt-1">
              Pas encore d’outil de réservation ? Moka Studio propose un module de prise de rendez-vous en ligne intégré à votre site
              {props.planningMonthlyCents ? <> pour <strong>{formatEuros(props.planningMonthlyCents)} par mois</strong></> : null}.
              Cette option n’est pas ajoutée automatiquement : nous en parlerons ensemble avant toute souscription.
            </p>
          </div>
        )}

        {isRecap && (
          <Recap answers={answers} files={files} missing={missing} onEdit={goTo} />
        )}

        {isRecap && props.submittedAt && (
          <p className="mt-8 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Questionnaire transmis le {new Date(props.submittedAt).toLocaleDateString('fr-FR')}.
          </p>
        )}

        {isRecap && !readOnly && !props.submittedAt && (
          <div className="mt-8 space-y-4 border-t border-beige-300/70 pt-6">
            <label className="flex cursor-pointer gap-3 rounded-2xl border border-beige-300 bg-creme/60 p-4 text-sm leading-relaxed text-anthracite-700">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-terracotta" />
              <span>
                {mode === 'client'
                  ? 'Je confirme que les informations transmises sont exactes et que je dispose des droits nécessaires pour utiliser les textes, photos et documents fournis.'
                  : 'Le client confirme que les informations transmises sont exactes et qu’il dispose des droits nécessaires pour utiliser les textes, photos et documents fournis.'}
              </span>
            </label>
            <div className="text-xs leading-relaxed text-anthracite-500">{props.privacy}</div>
            {submitError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{submitError}</p>}
            <button
              type="button" onClick={() => void submit()} disabled={!consent || submitting}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-6 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-terracotta-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {mode === 'client' ? 'Transmettre mon projet à Moka Studio' : 'Transmettre le questionnaire'}
            </button>
            {missing.length > 0 && (
              <p className="text-xs text-anthracite-500">Vous pouvez transmettre maintenant et compléter les informations manquantes plus tard.</p>
            )}
          </div>
        )}
      </section>

      {/* Navigation (collée en bas sur téléphone) */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-beige-300/70 bg-creme/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => goTo(step - 1)} disabled={step === 0}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-anthracite-700 hover:bg-beige/70 disabled:invisible">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Précédent</span>
          </button>
          <SaveIndicator state={save} onRetry={() => void flush(true)} readOnly={readOnly} />
          {!isRecap && (
            <button type="button" onClick={() => goTo(step + 1)}
              className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-xl bg-anthracite px-5 text-sm font-medium text-white hover:bg-anthracite-700">
              {step === STEPS.length - 2 ? 'Vérifier' : 'Suivant'} <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
        {!readOnly && props.onSaveLater && (
          <div className="mt-2 text-center sm:text-left">
            <button type="button" onClick={() => void saveLater()} className="text-sm font-medium text-terracotta-700 underline-offset-2 hover:underline">
              Enregistrer et continuer plus tard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Progression ------------------------------------------------------------------
function Progress({ step, pct, onGo }: { step: number; pct: number; onGo: (n: number) => void }) {
  return (
    <nav aria-label="Étapes du questionnaire" className="mb-5">
      <div className="mb-2 flex items-center justify-between text-xs text-anthracite-500">
        <span className="sm:hidden">{STEPS[step]!.short} · {step + 1}/{STEPS.length}</span>
        <span className="ml-auto">Complété à <strong className="text-anthracite">{pct} %</strong></span>
      </div>
      <ol className="grid grid-cols-6 gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button type="button" onClick={() => onGo(i)} aria-current={i === step ? 'step' : undefined} className="group block w-full text-left">
              <span className={clsx('block h-1.5 rounded-full transition-colors',
                i < step ? 'bg-terracotta' : i === step ? 'bg-anthracite' : 'bg-beige-300 group-hover:bg-anthracite-300')} />
              <span className={clsx('mt-2 hidden text-xs sm:block', i === step ? 'font-medium text-anthracite' : 'text-anthracite-500')}>{s.short}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SaveIndicator({ state, onRetry, readOnly }: { state: SaveState; onRetry: () => void; readOnly?: boolean }) {
  if (readOnly) return <span className="text-xs text-anthracite-500">Lecture seule</span>;
  if (state.kind === 'saving') return <span className="inline-flex items-center gap-1.5 text-xs text-anthracite-500" aria-live="polite"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enregistrement…</span>;
  if (state.kind === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-700" role="alert">
        <CloudOff className="h-3.5 w-3.5" /> Non enregistré
        <button type="button" onClick={onRetry} className="font-medium underline">Réessayer</button>
      </span>
    );
  }
  if (state.kind === 'saved' && state.at) {
    return <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700" aria-live="polite"><Check className="h-3.5 w-3.5" /> Enregistré à {state.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>;
  }
  return <span className="text-xs text-anthracite-500">Sauvegarde automatique</span>;
}

// --- Champs -----------------------------------------------------------------------
const inputCls = 'block w-full rounded-xl border border-beige-300 bg-white px-3.5 text-[15px] text-anthracite placeholder:text-anthracite-300 focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/25 disabled:bg-creme disabled:text-anthracite-500';

export function FieldInput({ field: f, value, onChange, disabled }: {
  field: Field; value: Answers[string]; onChange: (v: Answers[string]) => void; disabled?: boolean;
}) {
  const id = `q-${f.key}`;
  const err = formatError(f, value);
  const str = typeof value === 'string' ? value : '';
  const arr = Array.isArray(value) ? value : [];
  const toggle = (v: string) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  let control: ReactNode;
  switch (f.type) {
    case 'textarea':
      control = <textarea id={id} rows={f.rows ?? 3} value={str} disabled={disabled} placeholder={f.placeholder}
        onChange={(e) => onChange(e.target.value)} className={clsx(inputCls, 'py-2.5 leading-relaxed')} />;
      break;
    case 'select':
      control = (
        <select id={id} value={str} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} className={clsx(inputCls, 'h-12 pr-8')}>
          <option value="">Choisir…</option>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    case 'radio':
      control = (
        <div role="radiogroup" aria-labelledby={`${id}-l`} className="flex flex-wrap gap-2">
          {f.options?.map((o) => <Pill key={o.value} option={o} selected={str === o.value} disabled={disabled} role="radio" onClick={() => onChange(str === o.value ? null : o.value)} />)}
        </div>
      );
      break;
    case 'checkboxes':
      control = (
        <div role="group" aria-labelledby={`${id}-l`} className="flex flex-wrap gap-2">
          {f.options?.map((o) => <Pill key={o.value} option={o} selected={arr.includes(o.value)} disabled={disabled} onClick={() => toggle(o.value)} />)}
        </div>
      );
      break;
    case 'ambiances':
      control = (
        <div role="group" aria-labelledby={`${id}-l`} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {AMBIANCES.map((o) => {
            const on = arr.includes(o.value);
            return (
              <button key={o.value} type="button" aria-pressed={on} disabled={disabled} onClick={() => toggle(o.value)}
                className={clsx('relative overflow-hidden rounded-2xl border p-3 text-left transition-all',
                  on ? 'border-terracotta ring-2 ring-terracotta/25' : 'border-beige-300 hover:border-anthracite-300')}>
                <div className="flex h-16 items-end justify-between rounded-xl p-2.5" style={{ background: o.colors[2] }}>
                  <span className="text-2xl leading-none" style={{ fontFamily: o.font, color: o.colors[0] }}>Aa</span>
                  <span className="flex gap-1">
                    {o.colors.slice(0, 2).map((c) => <span key={c} className="h-4 w-4 rounded-full border border-black/5" style={{ background: c }} />)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-anthracite">{o.label}</p>
                <p className="text-xs text-anthracite-500">{o.hint}</p>
                {on && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-terracotta text-white"><Check className="h-3 w-3" /></span>}
              </button>
            );
          })}
        </div>
      );
      break;
    default:
      control = <input id={id} type={f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : 'text'}
        inputMode={f.type === 'tel' ? 'tel' : f.key === 'code_postal' ? 'numeric' : undefined}
        autoComplete={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : f.key === 'code_postal' ? 'postal-code' : 'off'}
        value={str} disabled={disabled} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)}
        className={clsx(inputCls, 'h-12', err && 'border-amber-400')} />;
  }

  const isGroup = f.type === 'radio' || f.type === 'checkboxes' || f.type === 'ambiances';
  return (
    <div>
      {isGroup
        ? <p id={`${id}-l`} className="mb-2 text-sm font-medium text-anthracite">{f.label}</p>
        : <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-anthracite">{f.label}</label>}
      {control}
      {err ? <p className="mt-1 text-xs text-amber-700">{err}</p> : f.help && <p className="mt-1.5 text-xs leading-relaxed text-anthracite-500">{f.help}</p>}
    </div>
  );
}

function Pill({ option, selected, onClick, disabled, role }: { option: Option; selected: boolean; onClick: () => void; disabled?: boolean; role?: 'radio' }) {
  return (
    <button type="button" role={role} aria-checked={role ? selected : undefined} aria-pressed={role ? undefined : selected}
      disabled={disabled} onClick={onClick}
      className={clsx('inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors',
        selected ? 'border-terracotta bg-terracotta-50 font-medium text-terracotta-700' : 'border-beige-300 bg-white text-anthracite-700 hover:border-anthracite-300')}>
      {selected && <Check className="h-3.5 w-3.5" aria-hidden />}
      {option.label}
    </button>
  );
}

// --- Documents --------------------------------------------------------------------
const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`);

export function FilesPanel({ files, disabled, backend, canRemove, onChange, title = 'Vos documents' }: {
  files: PortalFile[]; disabled?: boolean; backend: Pick<QuestionnaireBackend, 'upload' | 'remove'>;
  canRemove?: (f: PortalFile) => boolean; onChange: () => Promise<void>; title?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const add = async (category: string, list: FileList | null) => {
    if (!list?.length) return;
    setBusy(category);
    const errs: string[] = [];
    const arr = Array.from(list);
    for (let i = 0; i < arr.length; i++) {
      setProgress(arr.length > 1 ? `${i + 1} / ${arr.length}` : null);
      try { await backend.upload(category, arr[i]!); } catch (e) { errs.push(humanizeError(e)); }
    }
    setErrors(errs);
    setBusy(null);
    setProgress(null);
    await onChange().catch(() => undefined);
  };
  const remove = async (f: PortalFile) => {
    setBusy(f.id);
    try { await backend.remove(f.id); setErrors([]); } catch (e) { setErrors([humanizeError(e)]); }
    setBusy(null);
    await onChange().catch(() => undefined);
  };

  return (
    <div className="mt-8 border-t border-beige-300/70 pt-6">
      <h3 className="font-display text-lg font-semibold text-anthracite">{title}</h3>
      <p className="mt-1 text-sm text-anthracite-500">JPG, PNG, WEBP ou PDF · 10 Mo maximum par fichier · plusieurs fichiers possibles. Envoi sécurisé, visible uniquement par Moka Studio.</p>
      {errors.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      )}
      <ul className="mt-4 divide-y divide-beige-300/70 rounded-2xl border border-beige-300/80">
        {FILE_CATEGORIES.map((c) => {
          const mine = files.filter((f) => f.category === c.value);
          const inputId = `up-${c.value}`;
          return (
            <li key={c.value} className="p-3.5 sm:p-4"
              onDragOver={(e) => { if (!disabled) e.preventDefault(); }}
              onDrop={(e) => { if (disabled) return; e.preventDefault(); void add(c.value, e.dataTransfer.files); }}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-anthracite">{c.label} {mine.length > 0 && <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">{mine.length}</span>}</p>
                  <p className="text-xs text-anthracite-500">{c.help}</p>
                </div>
                {!disabled && (
                  <>
                    <input id={inputId} type="file" multiple className="sr-only"
                      accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                      onChange={(e) => { void add(c.value, e.target.files); e.target.value = ''; }} />
                    <label htmlFor={inputId}
                      className={clsx('inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-beige-300 bg-white px-3 text-sm font-medium text-anthracite-700 hover:bg-creme',
                        busy === c.value && 'pointer-events-none opacity-60')}>
                      {busy === c.value ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {busy === c.value ? (progress ?? 'Envoi…') : 'Ajouter'}
                    </label>
                  </>
                )}
              </div>
              {mine.length > 0 && (
                <ul className="mt-2.5 space-y-1.5">
                  {mine.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 rounded-lg bg-creme/70 px-2.5 py-1.5 text-sm">
                      {f.mime === 'application/pdf' ? <FileText className="h-4 w-4 shrink-0 text-terracotta" /> : <ImageIcon className="h-4 w-4 shrink-0 text-terracotta" />}
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="shrink-0 text-xs text-anthracite-500">{fmtSize(f.size)}</span>
                      {!disabled && canRemove?.(f) && (
                        <button type="button" onClick={() => void remove(f)} disabled={busy === f.id} aria-label={`Retirer ${f.name}`}
                          className="rounded p-1 text-anthracite-300 hover:bg-white hover:text-red-700">
                          {busy === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Récapitulatif ----------------------------------------------------------------
export function Recap({ answers, files, missing, onEdit }: {
  answers: Answers; files: PortalFile[]; missing: ReturnType<typeof missingInfo>; onEdit?: (step: number) => void;
}) {
  return (
    <div className="mt-6 space-y-4">
      {STEPS.slice(0, -1).map((s, i) => {
        const filled = visibleFields(s, answers).filter((f) => isFilled(answers[f.key]));
        const stepFiles = s.id === 'contenus' ? files : [];
        return (
          <div key={s.id} className="rounded-2xl border border-beige-300/80 p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-anthracite">{s.title}</h3>
              {onEdit && (
                <button type="button" onClick={() => onEdit(i)} className="inline-flex items-center gap-1 text-xs font-medium text-terracotta-700 hover:underline">
                  <Pencil className="h-3 w-3" /> Modifier
                </button>
              )}
            </div>
            {filled.length === 0 && !stepFiles.length ? (
              <p className="text-sm text-anthracite-300">Rien de renseigné pour l’instant.</p>
            ) : (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {filled.map((f) => (
                  <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                    <dt className="text-xs text-anthracite-500">{f.label}</dt>
                    <dd className="whitespace-pre-line break-words text-anthracite">{displayValue(f, answers[f.key])}</dd>
                  </div>
                ))}
                {stepFiles.length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-anthracite-500">Documents reçus</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {FILE_CATEGORIES.filter((c) => stepFiles.some((f) => f.category === c.value)).map((c) => (
                        <span key={c.value} className="inline-flex items-center gap-1 rounded-full bg-creme px-2.5 py-1 text-xs text-anthracite-700">
                          <Paperclip className="h-3 w-3" /> {c.label} · {stepFiles.filter((f) => f.category === c.value).length}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        );
      })}

      {missing.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Informations manquantes ({missing.length})</h3>
          <ul className="mt-2 grid gap-1 text-sm text-amber-900 sm:grid-cols-2">
            {missing.map((m) => (
              <li key={m.key}>
                {onEdit ? (
                  <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onEdit(STEPS.findIndex((s) => s.id === m.step))}>
                    {m.label}
                  </button>
                ) : m.label}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Toutes les informations essentielles sont renseignées.</p>
      )}
    </div>
  );
}
