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
} & Timestamps;

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
    };
    Views: {
      lead_overview: { Row: LeadOverview; Relationships: [] };
      task_overview: { Row: TaskOverview; Relationships: [] };
      contract_overview: { Row: ContractOverview; Relationships: [] };
      payment_overview: { Row: PaymentOverview; Relationships: [] };
      commission_overview: { Row: CommissionOverview; Relationships: [] };
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
    };
    Enums: {
      user_role: UserRole; lead_status: LeadStatus; lead_source: LeadSource; activity_kind: ActivityKind;
      task_type: TaskType; task_priority: TaskPriority; task_status: TaskStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = ProfileRow;
