-- =============================================================================
-- Moka Studio Business Hub — Migration 0001 : types énumérés
-- Toutes les valeurs métier fermées sont des ENUM PostgreSQL : la base refuse
-- toute valeur hors liste, quelle que soit l'origine de l'écriture.
-- =============================================================================

create type public.user_role as enum ('admin', 'commercial', 'apporteur');

-- Pipeline : l'ordre de déclaration = l'ordre des colonnes du Kanban.
create type public.lead_status as enum (
  'a_contacter', 'contacte', 'interesse', 'rdv_programme',
  'proposition_envoyee', 'negociation', 'gagne', 'perdu'
);

create type public.lead_source as enum (
  'prospection', 'apporteur', 'site_web', 'recommandation',
  'reseaux_sociaux', 'salon', 'autre'
);

create type public.activity_kind as enum (
  'creation', 'note', 'appel', 'email', 'sms', 'rendez_vous',
  'changement_statut', 'changement_responsable', 'conversion'
);

create type public.task_type     as enum ('appeler', 'email', 'sms', 'relancer', 'rendez_vous', 'proposition');
create type public.task_priority as enum ('basse', 'normale', 'haute', 'urgente');
create type public.task_status   as enum ('a_faire', 'en_cours', 'fait', 'annule');

create type public.offer_code as enum ('abonnement', 'vente_directe', 'option_planning');

create type public.deal_status         as enum ('ouvert', 'gagne', 'perdu');
create type public.contract_status     as enum ('brouillon', 'signe', 'actif', 'resilie', 'termine', 'annule');
create type public.site_status         as enum ('a_produire', 'en_cours', 'en_validation', 'en_ligne');
create type public.renewal_mode        as enum ('tacite', 'manuel', 'aucun');
create type public.subscription_status as enum ('active', 'suspendue', 'resiliee');

create type public.payment_kind   as enum ('mise_en_service', 'mensualite', 'vente_directe', 'autre');
create type public.payment_status as enum ('en_attente', 'encaisse', 'echoue', 'rembourse');

create type public.beneficiary_role  as enum ('commercial', 'apporteur');
create type public.commission_status as enum ('previsionnelle', 'acquise', 'facturee', 'payee', 'annulee');
create type public.commission_trigger as enum ('premier_encaissement', 'n_mensualites');

create type public.expense_category as enum ('frais_fixe', 'cout_variable', 'salaire', 'logiciel', 'autre');
create type public.scenario_kind    as enum ('prudent', 'central', 'ambitieux', 'personnalise');

create type public.objective_metric as enum ('contrats_signes', 'mrr_ajoute_cents', 'ca_encaisse_cents', 'rdv_obtenus');
