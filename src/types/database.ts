// Types de la base, au format de `supabase gen types typescript`.
// Seules les tables utilisées par l'interface sont décrites ; les autres
// arriveront avec leurs étapes. Pour régénérer le fichier complet :
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type UserRole = 'admin' | 'commercial' | 'apporteur';
export type LeadStatus =
  | 'a_contacter' | 'contacte' | 'interesse' | 'rdv_programme'
  | 'proposition_envoyee' | 'negociation' | 'gagne' | 'perdu';
export type LeadSource =
  | 'prospection' | 'apporteur' | 'site_web' | 'recommandation' | 'reseaux_sociaux' | 'salon' | 'autre';
export type ActivityKind =
  | 'creation' | 'note' | 'appel' | 'email' | 'sms' | 'rendez_vous'
  | 'changement_statut' | 'changement_responsable' | 'conversion';
export type TaskType = 'appeler' | 'email' | 'sms' | 'relancer' | 'rendez_vous' | 'proposition';
export type TaskPriority = 'basse' | 'normale' | 'haute' | 'urgente';
export type TaskStatus = 'a_faire' | 'en_cours' | 'fait' | 'annule';

export type OfferCode = 'abonnement' | 'vente_directe' | 'option_planning';
export type ContractStatus = 'brouillon' | 'signe' | 'actif' | 'resilie' | 'termine' | 'annule';
export type SiteStatus = 'a_produire' | 'en_cours' | 'en_validation' | 'en_ligne';
export type RenewalMode = 'tacite' | 'manuel' | 'aucun';
export type SubscriptionStatus = 'active' | 'suspendue' | 'resiliee';
export type PaymentKind = 'mise_en_service' | 'mensualite' | 'vente_directe' | 'autre';
export type PaymentStatus = 'en_attente' | 'encaisse' | 'echoue' | 'rembourse';
export type BeneficiaryRole = 'commercial' | 'apporteur';
export type CommissionStatus = 'previsionnelle' | 'acquise' | 'facturee' | 'payee' | 'annulee';
export type CommissionTrigger = 'premier_encaissement' | 'n_mensualites';

type Timestamps = { created_at: string; updated_at: string };
type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type ProfileRow = {
  id: string; role: UserRole; full_name: string; email: string; phone: string | null; is_active: boolean;
} & Timestamps;

export type CompanyRow = {
  id: string; name: string; siren: string | null; sector: string | null; address: string | null;
  postal_code: string | null; city: string | null; website: string | null; website_domain: string | null;
  created_by: string | null;
  latitude: number | null; longitude: number | null; geocode_precision: GeocodePrecision | null;
  geocode_label: string | null; geocoded_at: string | null;
} & Timestamps;

export type GeocodePrecision = 'adresse' | 'rue' | 'ville' | 'manuel' | 'introuvable';

export type MapPoint = {
  company_id: string; company_name: string; address: string | null; postal_code: string | null; city: string | null;
  latitude: number | null; longitude: number | null; geocode_precision: GeocodePrecision | null; geocoded_at: string | null;
  kind: 'prospect' | 'client'; status: LeadStatus | 'client'; lead_id: string | null; contract_id: string | null;
  owner_id: string | null; owner_name: string | null; source: LeadSource | null; next_follow_up_at: string | null;
  contact_first_name: string | null; contact_last_name: string | null; contact_phone: string | null;
  offer_code: OfferCode | null; site_status: SiteStatus | null; overdue_payments: number;
};

export type ContactRow = {
  id: string; company_id: string; first_name: string | null; last_name: string | null; job_title: string | null;
  email: string | null; email_normalized: string | null; phone: string | null; phone_normalized: string | null;
  is_primary: boolean;
} & Timestamps;

export type LeadRow = {
  id: string; company_id: string; contact_id: string | null; status: LeadStatus; source: LeadSource;
  owner_id: string | null; referrer_id: string | null; created_by: string | null;
  last_contact_at: string | null; next_follow_up_at: string | null; status_changed_at: string;
  lost_reason: string | null; notes: string | null;
} & Timestamps;

export type LeadActivityRow = {
  id: string; lead_id: string; actor_id: string | null; kind: ActivityKind;
  from_value: string | null; to_value: string | null; body: string | null; occurred_at: string; created_at: string;
};

export type TaskRow = {
  id: string; lead_id: string | null; customer_id: string | null; type: TaskType; title: string;
  description: string | null; due_at: string; priority: TaskPriority; status: TaskStatus;
  assignee_id: string; created_by: string | null; completed_at: string | null;
} & Timestamps;

export type OfferRow = {
  code: OfferCode; label: string; description: string | null; monthly_price_cents: number; setup_fee_cents: number;
  one_shot_price_cents: number; commitment_months: number; is_active: boolean; updated_by: string | null;
} & Timestamps;

export type AppSettingsRow = {
  id: boolean; variable_cost_per_sub_cents: number; fixed_costs_monthly_cents: number;
  contributions_provision_bps: number; creation_hour_cost_cents: number; stale_lead_days: number; updated_by: string | null;
  project_delivery_days: number; project_link_days: number; privacy_policy_url: string | null; contact_email: string | null;
} & Timestamps;

export type CommissionRuleRow = {
  id: string; beneficiary_role: BeneficiaryRole; offer_code: OfferCode; amount_cents: number;
  tranche1_bps: number; tranche2_bps: number; tranche2_after_payments: number | null;
  valid_from: string; valid_to: string | null; created_by: string | null; created_at: string;
};

export type ContractRow = {
  id: string; reference: string; customer_id: string; deal_id: string | null; offer_code: OfferCode; status: ContractStatus;
  monthly_price_cents: number; setup_fee_cents: number; one_shot_price_cents: number;
  with_planning_option: boolean; planning_monthly_cents: number; offer_snapshot: unknown;
  signed_at: string; activated_at: string | null; commitment_months: number; commitment_end_at: string | null;
  renewal: RenewalMode; terminated_at: string | null; termination_reason: string | null;
  site_status: SiteStatus; site_url: string | null; created_by: string | null;
} & Timestamps;

export type ContractOverview = {
  id: string; reference: string; customer_id: string; offer_code: OfferCode; status: ContractStatus;
  monthly_price_cents: number; setup_fee_cents: number; one_shot_price_cents: number;
  with_planning_option: boolean; planning_monthly_cents: number;
  signed_at: string; activated_at: string | null; commitment_months: number; commitment_end_at: string | null;
  renewal: RenewalMode; terminated_at: string | null; termination_reason: string | null;
  site_status: SiteStatus; site_url: string | null; created_at: string;
  company_id: string; lead_id: string; owner_id: string | null; referrer_id: string | null;
  company_name: string; city: string | null; owner_name: string | null;
  subscription_id: string | null; subscription_status: SubscriptionStatus | null;
  monthly_amount_cents: number | null; next_due_on: string | null;
  paid_cents: number; pending_cents: number; overdue_payments: number;
};

export type PaymentOverview = {
  id: string; contract_id: string; subscription_id: string | null; kind: PaymentKind; amount_cents: number;
  due_on: string; period_month: string | null; status: PaymentStatus; paid_at: string | null;
  method: string | null; external_ref: string | null; created_at: string;
  contract_reference: string; customer_id: string; company_name: string;
};

export type CommissionOverview = {
  id: string; contract_id: string; rule_id: string; beneficiary_id: string; beneficiary_role: BeneficiaryRole;
  offer_code: OfferCode; tranche: number; amount_cents: number; trigger_kind: CommissionTrigger;
  required_payments: number | null; status: CommissionStatus; acquired_at: string | null;
  invoiced_at: string | null; invoice_ref: string | null; paid_at: string | null; payout_ref: string | null;
  cancelled_at: string | null; cancel_reason: string | null; created_at: string;
  beneficiary_name: string | null; contract_reference: string; signed_at: string; customer_id: string; company_name: string;
};

export type MyCommission = {
  id: string; offer_code: OfferCode; tranche: number; amount_cents: number; status: CommissionStatus;
  acquired_at: string | null; paid_at: string | null; company_name: string; signed_at: string;
  trigger_kind: CommissionTrigger; required_payments: number | null;
};

export type LeadOverview = Omit<LeadRow, never> & {
  company_name: string; siren: string | null; sector: string | null; address: string | null;
  postal_code: string | null; city: string | null; website: string | null;
  contact_first_name: string | null; contact_last_name: string | null;
  contact_email: string | null; contact_phone: string | null;
  owner_name: string | null; referrer_name: string | null;
  last_activity_at: string; open_tasks: number; next_task_due_at: string | null;
};

export type TaskOverview = TaskRow & {
  company_name: string | null; lead_status: LeadStatus | null; assignee_name: string | null;
};

export type DuplicateMatch = {
  company_id: string; company_name: string; city: string | null;
  match_kind: 'siren' | 'email' | 'telephone' | 'site';
  is_blocking: boolean; mine: boolean; has_open_lead: boolean;
};

export type TimelineEntry = {
  id: string; kind: ActivityKind; from_value: string | null; to_value: string | null;
  body: string | null; occurred_at: string; actor_name: string | null;
};

export type Referral = {
  id: string; company_name: string; city: string | null; status: LeadStatus;
  created_at: string; status_changed_at: string;
};

export type ImportReport = {
  dry_run: boolean; total: number; imported: number; duplicates: number; errors: number;
  rows: { line: number; status: 'importe' | 'doublon' | 'erreur'; message?: string }[];
};

export type ScenarioKind = 'prudent' | 'central' | 'ambitieux' | 'personnalise';
export type ScenarioRow = {
  id: string; name: string; kind: ScenarioKind; start_month: string; horizon_years: number;
  assumptions: Record<string, number>; is_reference: boolean; created_by: string | null;
} & Timestamps;

export type DashboardKpis = {
  leads_created: number; leads_qualified: number; meetings: number; proposals: number; won: number; lost: number;
  contracts_signed: number; conversion_rate_bps: number | null;
  sales_by_owner: { name: string; contracts: number; value_cents: number }[];
  cash_in_cents: number; signed_unpaid_cents: number; mrr_cents: number; arr_cents: number;
  active_subscriptions: number; new_subscriptions: number; cancellations: number;
  commissions_due_cents: number; commissions_forecast_cents: number; commissions_paid_cents: number;
  fixed_costs_cents: number; variable_costs_cents: number; expenses_cents: number;
  contributions_provision_cents: number; estimated_cash_cents: number; overdue_cents: number; period_days: number;
};

export type MonthlyPoint = {
  month: string; cash_in_cents: number; mrr_cents: number; contracts_signed: number; active_subscriptions: number;
};


// --- Projets clients ------------------------------------------------------------
export type ProjectStatus =
  | 'en_attente_infos' | 'questionnaire_recu' | 'brief_a_valider' | 'pret_a_produire'
  | 'en_creation' | 'en_validation_client' | 'pret_a_publier' | 'livre' | 'annule';
export type QuestionnaireStatus = 'non_commence' | 'en_cours' | 'recu';
export type ProjectAnswers = Record<string, string | string[] | boolean | number | null>;

export type ClientProjectRow = {
  id: string; customer_id: string; contract_id: string | null; title: string; status: ProjectStatus;
  assignee_id: string | null; target_date: string | null; scope_validated_at: string | null; delivered_at: string | null;
  site_url: string | null; next_action: string | null; cancel_reason: string | null; status_changed_at: string;
  last_activity_at: string; created_by: string | null;
} & Timestamps;

export type ProjectOverview = {
  id: string; customer_id: string; contract_id: string | null; title: string; status: ProjectStatus;
  assignee_id: string | null; target_date: string | null; scope_validated_at: string | null; delivered_at: string | null;
  site_url: string | null; next_action: string | null; cancel_reason: string | null; status_changed_at: string;
  last_activity_at: string; created_by: string | null; created_at: string;
  company_name: string; sector: string | null; city: string | null; owner_id: string | null; owner_name: string | null;
  assignee_name: string | null; contract_reference: string | null; offer_code: OfferCode | null; with_planning_option: boolean | null;
  questionnaire_status: QuestionnaireStatus | null; completion_pct: number | null; submitted_at: string | null;
  last_saved_at: string | null; files_count: number; open_tasks: number; link_active: boolean; is_late: boolean;
};

export type ProjectQuestionnaireRow = {
  project_id: string; status: QuestionnaireStatus; answers: ProjectAnswers; current_step: number; completion_pct: number;
  started_at: string | null; submitted_at: string | null; submitted_via: 'client' | 'equipe' | null; submitted_by: string | null;
  consent_at: string | null; last_saved_via: 'client' | 'equipe' | null; last_saved_at: string | null; updated_at: string;
};

export type ProjectFileRow = {
  id: string; project_id: string; category: string; storage_path: string; original_name: string; mime_type: string;
  size_bytes: number; status: 'en_attente' | 'valide'; uploaded_via: 'client' | 'equipe'; uploaded_by: string | null;
  created_at: string; confirmed_at: string | null;
};

export type ProjectTaskRow = {
  id: string; project_id: string; title: string; status: 'a_faire' | 'en_cours' | 'fait'; assignee_id: string | null;
  due_on: string | null; position: number; done_at: string | null; created_by: string | null;
} & Timestamps;

export type ProjectEventKind =
  | 'projet_cree' | 'lien_cree' | 'lien_revoque' | 'questionnaire_commence' | 'questionnaire_recu' | 'documents_ajoutes'
  | 'document_supprime' | 'infos_manquantes' | 'brief_genere' | 'brief_valide' | 'statut' | 'commentaire' | 'modification';
export type ProjectEventRow = {
  id: string; project_id: string; kind: ProjectEventKind; body: string | null; from_value: string | null;
  to_value: string | null; actor_id: string | null; created_at: string;
};

export type ProjectBriefRow = {
  id: string; project_id: string; version: number; content: string; generated_by: string | null; created_at: string;
  validated_at: string | null; validated_by: string | null;
};

export type ProjectTokenRow = {
  id: string; project_id: string; created_by: string | null; created_at: string; expires_at: string;
  revoked_at: string | null; revoked_by: string | null; last_used_at: string | null; use_count: number;
};

export type NotificationRow = {
  id: string; user_id: string; project_id: string | null; kind: string; title: string; body: string | null;
  link: string | null; created_at: string; read_at: string | null; email_status: 'non_envoye' | 'a_envoyer' | 'envoye' | 'echec';
};

export type PortalFile = { id: string; category: string; name: string; size: number; mime: string; via?: 'client' | 'equipe'; created_at: string };
export type PortalData = {
  project: { title: string; company_name: string; status: ProjectStatus };
  questionnaire: {
    status: QuestionnaireStatus; answers: ProjectAnswers; current_step: number; completion_pct: number;
    submitted_at: string | null; last_saved_at: string | null;
  };
  files: PortalFile[];
  missing_message: string | null;
  planning_monthly_cents: number | null;
  privacy_policy_url: string | null;
  contact_email: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, 'id' | 'role' | 'full_name' | 'email'>;
      companies: Table<CompanyRow, 'name'>;
      contacts: Table<ContactRow, 'company_id'>;
      leads: Table<LeadRow, 'company_id'>;
      lead_activities: Table<LeadActivityRow, 'lead_id' | 'kind'>;
      tasks: Table<TaskRow, 'type' | 'title' | 'due_at' | 'assignee_id'>;
      offers: Table<OfferRow, 'code' | 'label'>;
      app_settings: Table<AppSettingsRow, never>;
      commission_rules: Table<CommissionRuleRow, 'beneficiary_role' | 'offer_code' | 'amount_cents' | 'tranche1_bps'>;
      contracts: Table<ContractRow, 'reference' | 'customer_id' | 'offer_code' | 'signed_at'>;
      financial_scenarios: Table<ScenarioRow, 'name' | 'kind' | 'start_month' | 'assumptions'>;
      client_projects: Table<ClientProjectRow, 'customer_id' | 'title'>;
      project_questionnaires: Table<ProjectQuestionnaireRow, 'project_id'>;
      project_files: Table<ProjectFileRow, 'project_id' | 'category' | 'storage_path' | 'original_name' | 'mime_type' | 'size_bytes' | 'uploaded_via'>;
      project_tasks: Table<ProjectTaskRow, 'project_id' | 'title'>;
      project_events: Table<ProjectEventRow, 'project_id' | 'kind'>;
      project_briefs: Table<ProjectBriefRow, 'project_id' | 'version' | 'content'>;
      project_access_tokens: Table<ProjectTokenRow, 'project_id' | 'expires_at'>;
      notifications: Table<NotificationRow, 'user_id' | 'kind' | 'title'>;
    };
    Views: {
      lead_overview: { Row: LeadOverview; Relationships: [] };
      task_overview: { Row: TaskOverview; Relationships: [] };
      contract_overview: { Row: ContractOverview; Relationships: [] };
      payment_overview: { Row: PaymentOverview; Relationships: [] };
      commission_overview: { Row: CommissionOverview; Relationships: [] };
      map_points: { Row: MapPoint; Relationships: [] };
      project_overview: { Row: ProjectOverview; Relationships: [] };
    };
    Functions: {
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      current_app_role: { Args: Record<PropertyKey, never>; Returns: UserRole | null };
      stale_lead_days: { Args: Record<PropertyKey, never>; Returns: number | null };
      team_directory: {
        Args: Record<PropertyKey, never>;
        Returns: { id: string; full_name: string; role: UserRole }[];
      };
      find_duplicates: {
        Args: { p_siren?: string | null; p_email?: string | null; p_phone?: string | null; p_website?: string | null };
        Returns: DuplicateMatch[];
      };
      create_lead: {
        Args: {
          p_company: Record<string, string | null>;
          p_contact?: Record<string, string | null>;
          p_source?: LeadSource;
          p_owner_id?: string | null;
          p_notes?: string | null;
          p_next_follow_up?: string | null;
          p_force?: boolean;
        };
        Returns: string;
      };
      submit_referral: {
        Args: { p_company: Record<string, string | null>; p_contact?: Record<string, string | null>; p_notes?: string | null };
        Returns: string;
      };
      my_referrals: { Args: Record<PropertyKey, never>; Returns: Referral[] };
      lead_timeline: { Args: { p_lead_id: string }; Returns: TimelineEntry[] };
      convert_lead_to_customer: {
        Args: {
          p_lead_id: string; p_offer_code: OfferCode; p_with_planning?: boolean; p_signed_at?: string;
          p_activated_at?: string | null; p_monthly_price_cents?: number | null; p_setup_fee_cents?: number | null;
          p_one_shot_price_cents?: number | null;
        };
        Returns: string;
      };
      activate_contract: { Args: { p_contract_id: string; p_date?: string }; Returns: undefined };
      end_contract: { Args: { p_contract_id: string; p_mode: ContractStatus; p_date?: string; p_reason?: string }; Returns: undefined };
      generate_monthly_payments: { Args: { p_month?: string }; Returns: number };
      set_payment_status: {
        Args: { p_payment_id: string; p_status: PaymentStatus; p_paid_at?: string | null; p_method?: string | null; p_reference?: string | null };
        Returns: undefined;
      };
      update_commissions: {
        Args: { p_ids: string[]; p_status: CommissionStatus; p_reference?: string | null; p_reason?: string | null };
        Returns: number;
      };
      publish_commission_rule: {
        Args: { p_role: BeneficiaryRole; p_offer: OfferCode; p_amount_cents: number; p_tranche1_bps: number; p_tranche2_bps: number; p_after: number | null };
        Returns: string;
      };
      my_commissions: { Args: Record<PropertyKey, never>; Returns: MyCommission[] };
      dashboard_kpis: { Args: { p_from: string; p_to: string }; Returns: DashboardKpis };
      dashboard_monthly: { Args: { p_end?: string; p_months?: number }; Returns: MonthlyPoint[] };
      save_scenario: { Args: { p_id: string; p_assumptions: Record<string, number> }; Returns: undefined };
      import_leads: {
        Args: {
          p_rows: { company: Record<string, string | null>; contact: Record<string, string | null>; notes: string | null }[];
          p_source?: LeadSource;
          p_owner_id?: string | null;
          p_next_follow_up?: string | null;
          p_file_name?: string | null;
          p_dry_run?: boolean;
        };
        Returns: ImportReport;
      };
      create_client_project: { Args: { p_contract_id: string; p_title?: string | null }; Returns: string };
      project_save_answers: { Args: { p_project_id: string; p_patch: ProjectAnswers; p_step?: number | null; p_completion?: number | null }; Returns: string };
      project_submit_questionnaire: { Args: { p_project_id: string; p_consent: boolean }; Returns: undefined };
      create_project_link: { Args: { p_project_id: string }; Returns: { token: string; expires_at: string } };
      revoke_project_links: { Args: { p_project_id: string }; Returns: number };
      add_project_comment: { Args: { p_project_id: string; p_body: string }; Returns: undefined };
      flag_missing_info: { Args: { p_project_id: string; p_message: string }; Returns: undefined };
      set_project_status: { Args: { p_project_id: string; p_status: ProjectStatus; p_note?: string | null; p_site_url?: string | null }; Returns: undefined };
      update_project: { Args: { p_project_id: string; p_patch: Record<string, string | null> }; Returns: undefined };
      save_project_brief: { Args: { p_project_id: string; p_content: string }; Returns: string };
      validate_project_brief: { Args: { p_brief_id: string }; Returns: undefined };
      mark_notifications_read: { Args: { p_ids?: string[] | null }; Returns: number };
      portal_open: { Args: { p_token: string }; Returns: PortalData };
      portal_save: { Args: { p_token: string; p_patch: ProjectAnswers; p_step?: number | null; p_completion?: number | null }; Returns: string };
      portal_submit: { Args: { p_token: string; p_consent: boolean }; Returns: undefined };
    };
    Enums: {
      user_role: UserRole; lead_status: LeadStatus; lead_source: LeadSource; activity_kind: ActivityKind;
      task_type: TaskType; task_priority: TaskPriority; task_status: TaskStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = ProfileRow;
