import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  LeadOverview, LeadSource, LeadStatus, LoggableKind, TaskOverview, TaskPriority, TaskStatus, TaskType,
} from './types';

export const keys = {
  leads: ['leads'] as const,
  lead: (id: string) => ['leads', id] as const,
  timeline: (id: string) => ['timeline', id] as const,
  tasks: ['tasks'] as const,
  team: ['team'] as const,
  staleDays: ['stale-days'] as const,
  referrals: ['referrals'] as const,
};

/** Renvoie les données de la branche « succès », ou lève l'erreur Supabase. */
function unwrap<R extends { data: unknown; error: unknown }>(res: R): Extract<R, { error: null }>['data'] {
  if (res.error) throw res.error;
  return res.data as Extract<R, { error: null }>['data'];
}

// --- Lecture ----------------------------------------------------------------
export function useLeads() {
  return useQuery({
    queryKey: keys.leads,
    queryFn: async () =>
      unwrap(await supabase.from('lead_overview').select('*').order('updated_at', { ascending: false }).limit(2000)),
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: keys.lead(id),
    queryFn: async () => unwrap(await supabase.from('lead_overview').select('*').eq('id', id).maybeSingle()),
  });
}

export function useTimeline(leadId: string) {
  return useQuery({
    queryKey: keys.timeline(leadId),
    queryFn: async () => unwrap(await supabase.rpc('lead_timeline', { p_lead_id: leadId })) ?? [],
  });
}

export function useTasks(filter?: { leadId?: string; openOnly?: boolean }) {
  return useQuery({
    queryKey: [...keys.tasks, filter ?? {}],
    queryFn: async () => {
      let q = supabase.from('task_overview').select('*').order('due_at', { ascending: true }).limit(1000);
      if (filter?.leadId) q = q.eq('lead_id', filter.leadId);
      if (filter?.openOnly) q = q.in('status', ['a_faire', 'en_cours']);
      return unwrap(await q) as TaskOverview[];
    },
  });
}

export function useTeam(enabled = true) {
  return useQuery({
    queryKey: keys.team,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => unwrap(await supabase.rpc('team_directory')) ?? [],
  });
}

export function useStaleDays() {
  return useQuery({
    queryKey: keys.staleDays,
    staleTime: 10 * 60_000,
    queryFn: async () => (unwrap(await supabase.rpc('stale_lead_days')) as number | null) ?? 14,
  });
}

// --- Écriture ---------------------------------------------------------------
function useInvalidate() {
  const qc = useQueryClient();
  return (leadId?: string) => {
    void qc.invalidateQueries({ queryKey: keys.leads });
    void qc.invalidateQueries({ queryKey: keys.tasks });
    if (leadId) void qc.invalidateQueries({ queryKey: keys.timeline(leadId) });
  };
}

/** Mise à jour optimiste du statut (Kanban) */
export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id: string; status: LeadStatus; lostReason?: string }) => {
      unwrap(
        await supabase
          .from('leads')
          .update({ status: v.status, lost_reason: v.status === 'perdu' ? v.lostReason ?? null : null })
          .eq('id', v.id)
          .select('id')
          .single(),
      );
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.leads });
      const previous = qc.getQueryData<LeadOverview[]>(keys.leads);
      qc.setQueryData<LeadOverview[]>(keys.leads, (old) =>
        old?.map((l) => (l.id === v.id ? { ...l, status: v.status, status_changed_at: new Date().toISOString() } : l)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.leads, ctx.previous);
    },
    onSettled: (_d, _e, v) => {
      invalidate(v.id);
      void qc.invalidateQueries({ queryKey: keys.lead(v.id) });
    },
  });
}

export type LeadPatch = {
  next_follow_up_at?: string | null;
  notes?: string | null;
  owner_id?: string | null;
};

export function useUpdateLead(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (patch: LeadPatch) => {
      unwrap(await supabase.from('leads').update(patch).eq('id', id).select('id').single());
    },
    onSuccess: () => {
      invalidate(id);
      void qc.invalidateQueries({ queryKey: keys.lead(id) });
    },
  });
}

export type CompanyPatch = {
  name: string; siren: string | null; sector: string | null; address: string | null;
  postal_code: string | null; city: string | null; website: string | null;
};
export type ContactPatch = {
  first_name: string | null; last_name: string | null; email: string | null; phone: string | null;
};

export function useUpdateCompanyAndContact(lead: Pick<LeadOverview, 'id' | 'company_id' | 'contact_id'>) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { company: CompanyPatch; contact: ContactPatch }) => {
      unwrap(await supabase.from('companies').update(v.company).eq('id', lead.company_id).select('id').single());
      const hasContact = Object.values(v.contact).some(Boolean);
      if (lead.contact_id) {
        unwrap(await supabase.from('contacts').update(v.contact).eq('id', lead.contact_id).select('id').single());
      } else if (hasContact) {
        const created = unwrap(
          await supabase.from('contacts').insert({ ...v.contact, company_id: lead.company_id, is_primary: true }).select('id').single(),
        ) as { id: string };
        unwrap(await supabase.from('leads').update({ contact_id: created.id }).eq('id', lead.id).select('id').single());
      }
    },
    onSuccess: () => {
      invalidate(lead.id);
      void qc.invalidateQueries({ queryKey: keys.lead(lead.id) });
    },
  });
}

export function useLogActivity(leadId: string, actorId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { kind: LoggableKind; body: string }) => {
      unwrap(
        await supabase
          .from('lead_activities')
          .insert({ lead_id: leadId, actor_id: actorId, kind: v.kind, body: v.body.trim() || null })
          .select('id')
          .single(),
      );
    },
    onSuccess: () => {
      invalidate(leadId);
      void qc.invalidateQueries({ queryKey: keys.lead(leadId) });
    },
  });
}

export type NewLeadInput = {
  company: Record<string, string | null>;
  contact: Record<string, string | null>;
  source: LeadSource;
  ownerId: string | null;
  notes: string | null;
  nextFollowUp: string | null;
  force: boolean;
};

export function useCreateLead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: NewLeadInput) =>
      unwrap(
        await supabase.rpc('create_lead', {
          p_company: v.company,
          p_contact: v.contact,
          p_source: v.source,
          p_owner_id: v.ownerId,
          p_notes: v.notes,
          p_next_follow_up: v.nextFollowUp,
          p_force: v.force,
        }),
      ) as string,
    onSuccess: () => invalidate(),
  });
}

export function useSubmitReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { company: Record<string, string | null>; contact: Record<string, string | null>; notes: string | null }) =>
      unwrap(await supabase.rpc('submit_referral', { p_company: v.company, p_contact: v.contact, p_notes: v.notes })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.referrals }),
  });
}

export function useReferrals() {
  return useQuery({
    queryKey: keys.referrals,
    queryFn: async () => unwrap(await supabase.rpc('my_referrals')) ?? [],
  });
}

export async function findDuplicates(v: { siren?: string; email?: string; phone?: string; website?: string }) {
  const clean = (s?: string) => (s && s.trim() ? s.trim() : null);
  if (!clean(v.siren) && !clean(v.email) && !clean(v.phone) && !clean(v.website)) return [];
  return (
    unwrap(
      await supabase.rpc('find_duplicates', {
        p_siren: clean(v.siren), p_email: clean(v.email), p_phone: clean(v.phone), p_website: clean(v.website),
      }),
    ) ?? []
  );
}

// --- Tâches -----------------------------------------------------------------
export type TaskInput = {
  lead_id: string | null;
  type: TaskType;
  title: string;
  description: string | null;
  due_at: string;
  priority: TaskPriority;
  assignee_id: string;
};

export function useSaveTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id?: string; input: TaskInput; createdBy: string }) => {
      if (v.id) {
        unwrap(await supabase.from('tasks').update(v.input).eq('id', v.id).select('id').single());
      } else {
        unwrap(await supabase.from('tasks').insert({ ...v.input, created_by: v.createdBy }).select('id').single());
      }
    },
    onSuccess: (_d, v) => invalidate(v.input.lead_id ?? undefined),
  });
}

export function useSetTaskStatus() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id: string; status: TaskStatus; leadId: string | null }) => {
      unwrap(await supabase.from('tasks').update({ status: v.status }).eq('id', v.id).select('id').single());
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.tasks });
      const snapshot = qc.getQueriesData<TaskOverview[]>({ queryKey: keys.tasks });
      qc.setQueriesData<TaskOverview[]>({ queryKey: keys.tasks }, (old) =>
        old?.map((t) => (t.id === v.id ? { ...t, status: v.status } : t)),
      );
      return { snapshot };
    },
    onError: (_e, _v, ctx) => ctx?.snapshot.forEach(([k, d]) => qc.setQueryData(k, d)),
    onSettled: (_d, _e, v) => invalidate(v.leadId ?? undefined),
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id: string; leadId: string | null }) => {
      const res = await supabase.from('tasks').delete().eq('id', v.id).select('id');
      const rows = unwrap(res);
      if (!rows?.length) throw new Error("Vous n'avez pas les droits pour supprimer cette tâche.");
    },
    onSuccess: (_d, v) => invalidate(v.leadId ?? undefined),
  });
}
