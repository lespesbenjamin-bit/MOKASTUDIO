// Portail client : questionnaire accessible par lien personnel, sans compte.
// Toutes les opérations passent par les fonctions portal_* qui vérifient le jeton.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, Copy, Loader2, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { humanizeError, isDemo } from '@/lib/supabase';
import { Modal } from '@/components/ui';
import type { PortalData } from '@/types/database';
import { deleteProjectFile, portal, uploadProjectFile } from './api';
import { FilesPanel, Questionnaire, type QuestionnaireBackend } from './Questionnaire';
import { STEPS } from './questions';

type View = 'welcome' | 'form' | 'done' | 'later';

export function PortalPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('welcome');
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useEffect(() => {
    document.title = 'Votre projet — Moka Studio';
    portal.open(token)
      .then((d) => {
        setData(d);
        setView(d.questionnaire.status === 'recu' ? 'done' : d.questionnaire.status === 'en_cours' ? 'form' : 'welcome');
      })
      .catch((e) => setError(humanizeError(e)));
  }, [token]);

  const backend: QuestionnaireBackend = useMemo(() => ({
    save: (patch, step, pct) => portal.save(token, patch, step, pct),
    submit: () => portal.submit(token),
    upload: (category, file) => uploadProjectFile({ token }, category, file),
    remove: (id) => deleteProjectFile({ token }, id),
    refreshFiles: async () => {
      const d = await portal.open(token);
      setData((cur) => (cur ? { ...cur, files: d.files } : d));
      return d.files;
    },
  }), [token]);

  if (error) {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-3xl border border-beige-300 bg-white p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-terracotta" aria-hidden />
          <h1 className="mt-4 font-display text-2xl font-semibold">Lien indisponible</h1>
          <p className="mt-2 text-sm leading-relaxed text-anthracite-500">
            Ce lien n’est plus valide : il a peut-être expiré ou été remplacé par un nouveau.
            Contactez votre interlocuteur Moka Studio pour en recevoir un nouveau.
          </p>
        </div>
      </Shell>
    );
  }
  if (!data) {
    return <Shell><div className="flex justify-center py-24 text-anthracite-500"><Loader2 className="h-5 w-5 animate-spin" aria-label="Chargement" /></div></Shell>;
  }

  const privacy = (
    <PrivacyNote url={data.privacy_policy_url} onOpen={() => setPrivacyOpen(true)} />
  );

  return (
    <Shell contact={data.contact_email}>
      {view === 'welcome' && (
        <Welcome company={data.project.company_name} onStart={() => setView('form')} />
      )}

      {view === 'form' && (
        <>
          <p className="mb-4 text-sm text-anthracite-500">Projet : <strong className="font-medium text-anthracite">{data.project.company_name}</strong></p>
          <Questionnaire
            initialAnswers={data.questionnaire.answers}
            initialStep={data.questionnaire.current_step}
            files={data.files}
            mode="client"
            backend={backend}
            planningMonthlyCents={data.planning_monthly_cents}
            privacy={privacy}
            missingMessage={data.missing_message}
            canRemove={(f) => f.via === 'client'}
            onSubmitted={() => setView('done')}
            onSaveLater={() => setView('later')}
          />
        </>
      )}

      {view === 'later' && (
        <Centered icon={<Clock className="h-7 w-7" />} title="Vos réponses sont enregistrées">
          <p>Vous pouvez fermer cette page. Pour reprendre, rouvrez simplement ce même lien : vous retrouverez vos réponses là où vous les avez laissées.</p>
          <CopyLink />
          <button type="button" onClick={() => setView('form')} className="mt-2 text-sm font-medium text-terracotta-700 hover:underline">Reprendre maintenant</button>
        </Centered>
      )}

      {view === 'done' && (
        <>
          <Centered icon={<CheckCircle2 className="h-7 w-7" />} title="Merci !">
            <p>
              Votre projet est maintenant entre les mains de Moka Studio. Nous allons étudier vos informations
              et revenir vers vous si des éléments complémentaires sont nécessaires.
            </p>
          </Centered>
          <div className="mx-auto mt-6 max-w-3xl rounded-3xl border border-beige-300/80 bg-white p-5 sm:p-8">
            <FilesPanel
              title="Un document à ajouter ?"
              files={data.files} backend={backend}
              onChange={async () => { await backend.refreshFiles(); }}
            />
          </div>
        </>
      )}

      <Modal open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Vos données personnelles" size="lg">
        <PrivacyText contact={data.contact_email} />
      </Modal>
    </Shell>
  );
}

function Shell({ children, contact }: { children: ReactNode; contact?: string | null }) {
  return (
    <div className="min-h-screen bg-creme text-anthracite">
      {isDemo && (
        <div role="status" className="bg-anthracite px-4 py-2 text-center text-xs text-white">
          <strong className="uppercase tracking-wider text-terracotta-100">Démonstration — données fictives</strong>
          <span className="text-white/70"> · Aperçu du questionnaire client : rien n’est enregistré.</span>
        </div>
      )}
      <header className="mx-auto flex max-w-3xl items-center gap-3 px-4 pb-2 pt-6 sm:pt-10">
        <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="#B66B50" /><path d="M8 22V11l8 7 8-7v11" fill="none" stroke="#F8F4EF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div className="leading-tight">
          <p className="font-display text-lg font-semibold">Moka Studio</p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-anthracite-500">Création de sites internet</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4">{children}</main>
      <footer className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-10 text-xs text-anthracite-500">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Lien personnel et sécurisé — ne le partagez pas.</span>
        {contact && <a href={`mailto:${contact}`} className="hover:text-anthracite">Une question ? {contact}</a>}
      </footer>
    </div>
  );
}

function Welcome({ company, onStart }: { company: string; onStart: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-beige-300/80 bg-white px-6 py-10 sm:px-12 sm:py-14">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-beige" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-terracotta-50" />
      <div className="relative">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-creme px-3 py-1 text-xs font-medium text-terracotta-700">
          <Sparkles className="h-3.5 w-3.5" /> {company}
        </p>
        <h1 className="mt-5 max-w-xl font-display text-[2rem] font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          Créons ensemble un site qui vous <em className="not-italic text-terracotta">ressemble.</em>
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-anthracite-700 sm:text-base">
          Quelques informations sur votre activité nous permettront de concevoir un site internet fidèle à votre univers,
          à vos besoins et à vos clients.
        </p>
        <ul className="mt-7 grid max-w-xl gap-2 text-sm text-anthracite-700 sm:grid-cols-2">
          <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-terracotta" /> Environ 15 minutes</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-terracotta" /> Sauvegarde automatique</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-terracotta" /> Reprise possible à tout moment</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-terracotta" /> Aucune réponse n’est obligatoire</li>
        </ul>
        <ol className="mt-8 flex flex-wrap gap-2 text-xs text-anthracite-500">
          {STEPS.map((s, i) => <li key={s.id} className="rounded-full border border-beige-300 px-3 py-1">{i + 1}. {s.title}</li>)}
        </ol>
        <button type="button" onClick={onStart}
          className="mt-9 inline-flex h-12 items-center gap-2 rounded-xl bg-terracotta px-7 text-[15px] font-medium text-white shadow-sm hover:bg-terracotta-600">
          Commencer
        </button>
      </div>
    </section>
  );
}

function Centered({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-xl rounded-[2rem] border border-beige-300/80 bg-white px-6 py-10 text-center sm:px-10">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-terracotta-50 text-terracotta">{icon}</div>
      <h1 className="mt-4 font-display text-3xl font-semibold">{title}</h1>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-anthracite-700">{children}</div>
    </section>
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button"
      onClick={() => { void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true)); }}
      className="mx-auto inline-flex h-10 items-center gap-2 rounded-xl border border-beige-300 px-4 text-sm font-medium text-anthracite-700 hover:bg-creme">
      <Copy className="h-4 w-4" /> {copied ? 'Lien copié' : 'Copier le lien'}
    </button>
  );
}

export function PrivacyNote({ url, onOpen }: { url: string | null; onOpen: () => void }) {
  return (
    <p>
      Vos informations sont utilisées uniquement par Moka Studio pour concevoir et mettre en ligne votre site, et sont conservées
      de façon sécurisée. Vous pouvez à tout moment demander leur consultation, leur correction ou leur suppression.{' '}
      {url
        ? <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-terracotta-700 underline">Politique de confidentialité</a>
        : <button type="button" onClick={onOpen} className="font-medium text-terracotta-700 underline">Politique de confidentialité</button>}
    </p>
  );
}

export function PrivacyText({ contact }: { contact: string | null }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-anthracite-700">
      <p><strong>Responsable du traitement :</strong> Moka Studio.</p>
      <p><strong>Finalité :</strong> recueillir les informations, textes, photos et documents nécessaires à la conception, à la mise en ligne et au suivi de votre site internet, dans le cadre du contrat conclu avec Moka Studio.</p>
      <p><strong>Données concernées :</strong> informations sur votre entreprise, coordonnées professionnelles, contenus et documents que vous choisissez de transmettre.</p>
      <p><strong>Destinataires :</strong> l’équipe Moka Studio uniquement. Les contenus destinés à être publiés le seront sur votre site, avec votre accord. Aucune donnée n’est vendue ni cédée.</p>
      <p><strong>Hébergement :</strong> les données sont stockées chez un hébergeur sécurisé (Supabase), avec un accès limité à l’équipe Moka Studio.</p>
      <p><strong>Durée de conservation :</strong> pendant la durée de la relation contractuelle, puis pendant la durée de prescription légale applicable.</p>
      <p><strong>Vos droits :</strong> accès, rectification, effacement, limitation, opposition et portabilité, en écrivant à {contact ? <a className="text-terracotta-700 underline" href={`mailto:${contact}`}>{contact}</a> : 'votre interlocuteur Moka Studio'}. Vous pouvez également saisir la CNIL (cnil.fr).</p>
    </div>
  );
}
