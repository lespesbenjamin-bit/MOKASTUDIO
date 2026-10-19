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
    };
    Views: {
      lead_overview: { Row: LeadOverview; Relationships: [] };
      task_overview: { Row: TaskOverview; Relationships: [] };
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
